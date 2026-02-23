import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { messageBus } from "@/lib/execution/message-bus";
import { AgentRole, MessageType, MessageStatus } from "@prisma/client";
import { createAgentForRole, groupBy, findNextTask, isSessionComplete } from "@/lib/execution/agent-factory";
import { getProjectDir } from "@/lib/project-workspace";
import { initProjectWorkspace } from "@/lib/project/init-workspace";
import { ExecutionSessionManager } from "@/lib/execution/session-manager";
import { runReflexologistForSession } from "@/lib/agents/reflexologist";
import { appendSessionLog } from "@/lib/execution/file-logger";

const MAX_ITERATIONS = 500;
const ITERATION_PAUSE_MS = 1000;

async function persistExecutionLog(
  sessionId: string,
  level: "info" | "error" | "success",
  message: string
) {
  try {
    const type =
      level === "error" ? "error" :
      level === "success" ? "success" :
      "info";

    await prisma.executionLog.create({
      data: {
        sessionId,
        type,
        message,
        metadata: {
          eventType: "system",
          data: { level },
        },
      },
    });
    appendSessionLog(sessionId, level, message);
  } catch (error) {
    console.error("[AHP Dispatcher] Failed to persist executionLog:", error);
  }
}

async function runAHPDispatcher(sessionId: string) {
  try {
    const session = await prisma.executionSession.findUnique({
      where: { id: sessionId },
      include: { project: true },
    });

    if (!session) {
      console.error(`[AHP Dispatcher] Session ${sessionId} not found`);
      return;
    }

    console.log(`[AHP Dispatcher ${sessionId}] Starting dispatcher...`);
    await persistExecutionLog(sessionId, "info", "[AHP] Dispatcher started");

    const sessionMetadata = (session.metadata as Record<string, any>) || {};
    const autoApprove = sessionMetadata.autoApprove || false;

    const projectDir = getProjectDir(session.projectId);
    await initProjectWorkspace(session.projectId);
    console.log(`[AHP Dispatcher] Initialized workspace: ${projectDir}`);
    appendSessionLog(sessionId, "info", `[AHP] Initialized workspace: ${projectDir}`);

    if (session.planId) {
      const todoCount = await prisma.task.count({
        where: { planId: session.planId, status: "TODO" },
      });
      if (todoCount === 0) {
        const updated = await prisma.task.updateMany({
          where: { planId: session.planId, status: "IN_PROGRESS" },
          data: { status: "TODO" },
        });
        if (updated.count > 0) {
          console.log(`[AHP Dispatcher] Reset ${updated.count} IN_PROGRESS tasks to TODO (stuck from previous run)`);
          await persistExecutionLog(sessionId, "info",
            `[AHP] Reset ${updated.count} IN_PROGRESS tasks to TODO (stuck from previous run)`);
        }
      }
    }

    const config = {
      onLog: async (level: "info" | "error" | "success", message: string) => {
        console.log(`[AHP Dispatcher/${sessionId}] [${level}] ${message}`);
        await persistExecutionLog(sessionId, level, message);
      },
      mode: "cloud" as const,
    };

    let iteration = 0;

    while (iteration < MAX_ITERATIONS) {
      iteration++;

      console.log(`[AHP Dispatcher] Iteration ${iteration}/${MAX_ITERATIONS}`);
      await persistExecutionLog(
        sessionId,
        "info",
        `[AHP] Iteration ${iteration}/${MAX_ITERATIONS}`
      );

      const isComplete = await isSessionComplete(sessionId);
      if (isComplete) {
        console.log(`[AHP Dispatcher] Session ${sessionId} is complete`);
        break;
      }

      const pendingMessages = await prisma.agentMessage.findMany({
        where: {
          sessionId,
          status: { in: [MessageStatus.PENDING, MessageStatus.PROCESSING] },
        },
        orderBy: { createdAt: "asc" },
      });

      console.log(`[AHP Dispatcher] Found ${pendingMessages.length} pending/processing messages`);
      appendSessionLog(sessionId, "info", `[AHP] Found ${pendingMessages.length} pending/processing messages`);

      if (pendingMessages.length === 0) {
        console.log(`[AHP Dispatcher] No pending messages, finding next task...`);
        appendSessionLog(sessionId, "info", "[AHP] No pending messages, finding next task...");

        const nextItem = await findNextTask(session.projectId, session.planId);

        if (!nextItem) {
          console.log(`[AHP Dispatcher] No more tasks/tickets to process`);
          appendSessionLog(sessionId, "info", "[AHP] No more tasks/tickets to process");
          break;
        }

        console.log(`[AHP Dispatcher] Found next ${nextItem.type}: ${nextItem.data.id}`);
        appendSessionLog(sessionId, "info", `[AHP] Found next ${nextItem.type}: ${nextItem.data.id}`);

        if (nextItem.type === "ticket") {
          const ticket = nextItem.data;
          await prisma.ticket.update({
            where: { id: ticket.id },
            data: { status: "IN_PROGRESS" },
          });

          await messageBus.postMessage({
            sessionId,
            sourceAgent: AgentRole.TEAMLEAD,
            targetAgent: ticket.relatedTaskId
              ? (await prisma.task.findUnique({
                  where: { id: ticket.relatedTaskId },
                  select: { executorAgent: true },
                }))?.executorAgent || AgentRole.TASK_EXECUTOR
              : AgentRole.TASK_EXECUTOR,
            eventType: MessageType.TICKET_REQUEST,
            payload: { ticketId: ticket.id, relatedTaskId: ticket.relatedTaskId },
          });

          console.log(`[AHP Dispatcher] Created TICKET_REQUEST for ticket ${ticket.id}`);
          appendSessionLog(sessionId, "info", `[AHP] Created TICKET_REQUEST for ticket ${ticket.id}`);
        } else {
          const task = nextItem.data;
          await prisma.task.update({
            where: { id: task.id },
            data: { status: "IN_PROGRESS" },
          });
          await messageBus.postMessage({
            sessionId,
            sourceAgent: AgentRole.TEAMLEAD,
            targetAgent: task.executorAgent || AgentRole.TASK_EXECUTOR,
            eventType: MessageType.TASK_REQUEST,
            payload: { taskId: task.id },
          });

          console.log(`[AHP Dispatcher] Created TASK_REQUEST for task ${task.id}`);
          appendSessionLog(sessionId, "info", `[AHP] Created TASK_REQUEST for task ${task.id}`);
        }

        continue;
      }

      const pendingOnlyMessages = pendingMessages.filter(
        (m) => m.status === MessageStatus.PENDING
      );

      if (pendingOnlyMessages.length === 0) {
        console.log(`[AHP Dispatcher] Only processing messages, waiting...`);
        appendSessionLog(sessionId, "info", "[AHP] Only processing messages, waiting...");
        await new Promise((resolve) => setTimeout(resolve, ITERATION_PAUSE_MS));
        continue;
      }

      const messagesByAgent = groupBy(pendingOnlyMessages, "targetAgent");

      console.log(
        `[AHP Dispatcher] Active agents: ${Object.keys(messagesByAgent).join(", ")}`
      );
      appendSessionLog(sessionId, "info", `[AHP] Active agents: ${Object.keys(messagesByAgent).join(", ")}`);

      const agentPromises = Object.entries(messagesByAgent).map(
        async ([agentRole, messages]) => {
          try {
            console.log(`[AHP Dispatcher] Creating agent for role: ${agentRole}`);
            appendSessionLog(sessionId, "info", `[AHP] Creating agent for role: ${agentRole}`);

            const agent = createAgentForRole(
              agentRole as AgentRole,
              sessionId,
              session.projectId,
              autoApprove,
              config.onLog,
              config.mode
            );

            console.log(`[AHP Dispatcher] Running ${agentRole} agent...`);
            appendSessionLog(sessionId, "info", `[AHP] Running ${agentRole} agent...`);
            await agent.run();

            console.log(`[AHP Dispatcher] ${agentRole} agent completed`);
            appendSessionLog(sessionId, "info", `[AHP] ${agentRole} agent completed`);
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error(`[AHP Dispatcher] Agent ${agentRole} failed:`, error);
            appendSessionLog(sessionId, "error", `[AHP] Agent ${agentRole} failed: ${errorMsg}`);
          }
        }
      );

      await Promise.allSettled(agentPromises);

      await new Promise((resolve) => setTimeout(resolve, ITERATION_PAUSE_MS));
    }

    const stopReason = iteration >= MAX_ITERATIONS
      ? "MAX_ITERATIONS reached"
      : "No more tasks to process";

    console.log(`[AHP Dispatcher ${sessionId}] Loop finished. Reason: ${stopReason}`);
    await persistExecutionLog(sessionId, "info",
      `[AHP] Session stopping: ${stopReason}`);

    await finalizeSession(sessionId, session.projectId, session.planId, stopReason);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[AHP Dispatcher] Error running session ${sessionId}:`, error);
    appendSessionLog(sessionId, "error", `[AHP] Dispatcher error: ${errMsg}`);
  }
}

async function finalizeSession(
  sessionId: string,
  projectId: string,
  planId: string | null | undefined,
  reason?: string
) {
  appendSessionLog(sessionId, "info", `[AHP] Finalizing session. Reason: ${reason || "All tasks completed"}`);
  console.log(`[AHP Dispatcher] Finalizing session ${sessionId}... Reason: ${reason || "All tasks completed"}`);

  const sessionManager = ExecutionSessionManager.getInstance();
  await sessionManager.stopSession(sessionId, "All tasks completed");

  if (planId) {
    const planTasks = await prisma.task.findMany({
      where: { planId },
      select: { id: true, status: true },
    });

    const allDone = planTasks.every((t) => t.status === "DONE");
    const hasWaitingApproval = planTasks.some(
      (t) => t.status === "WAITING_APPROVAL"
    );

    if (allDone) {
      await prisma.project.update({
        where: { id: projectId },
        data: { status: "COMPLETED" },
      });

      console.log(`[AHP Dispatcher] Project ${projectId} marked as COMPLETED`);

      await prisma.executionLog.create({
        data: {
          sessionId,
          type: "success",
          message:
            "✅ Session completed. All tasks processed via Agent Hive Protocol.",
          metadata: { eventType: "session_completed" },
        },
      });
    } else if (hasWaitingApproval) {
      const stuckTasks = planTasks.filter(
        (t) => t.status === "WAITING_APPROVAL"
      );
      const stuckIds = stuckTasks.map((t) => t.id).join(", ");

      await prisma.executionLog.create({
        data: {
          sessionId,
          type: "info",
          message:
            "[AHP] Some tasks remain in WAITING_APPROVAL after automatic QA retries. Human review required.",
          metadata: {
            eventType: "task_qa_stuck",
            data: {
              sessionId,
              planId,
              taskIds: stuckIds,
            },
          },
        },
      });

      console.log(`[AHP Dispatcher] Tasks stuck in WAITING_APPROVAL: ${stuckIds}`);
    }
  }

  await prisma.executionLog.create({
    data: {
      sessionId,
      type: "info",
      message: `[AHP] Session stopped. Reason: ${reason || "All tasks completed"}`,
      metadata: { eventType: "session_stopped", data: { sessionId, reason } },
    },
  });

  try {
    await runReflexologistForSession({
      projectId,
      sessionId,
      planId,
      mode: "final",
      maxInsights: 3,
    });
  } catch (error) {
    console.error(
      `[AHP Dispatcher] Reflexologist failed for session ${sessionId}:`,
      error
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId } = body;

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    console.log("\n\n🚀 [AHP Dispatcher] Starting Agent Hive Protocol...\n\n");

    runAHPDispatcher(sessionId);

    return NextResponse.json({
      success: true,
      message: "AHP Dispatcher started",
      sessionId,
    });
  } catch (error) {
    console.error("[AHP Dispatcher] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start AHP" },
      { status: 500 }
    );
  }
}
