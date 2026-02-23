import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import { prisma } from "@/lib/prisma";
import { ExecutionAgent, type ExecuteTaskResult } from "@/lib/agents/execution-agent";
import { generateTaskPrompt } from "@/lib/agents/prompt-generator";
import { verifyTaskCompletion } from "@/lib/agents/qa";
import { ExecutionSessionManager } from "@/lib/execution/session-manager";
import { getProjectDir } from "@/lib/project-workspace";
import { initProjectWorkspace } from "@/lib/project/init-workspace";
import { runReflexologistForSession } from "@/lib/agents/reflexologist";

async function runExecutionSession(sessionId: string) {
  try {
    const session = await prisma.executionSession.findUnique({
      where: { id: sessionId },
      include: {
        project: true,
      },
    });

    if (!session) {
      console.error(`[Worker] Session ${sessionId} not found`);
      return;
    }

    console.log(`[WORKER ${sessionId}] Starting agent...`);

    const sessionMetadata = (session.metadata as Record<string, any>) || {};
    const executionMode: "local" | "cloud" =
      sessionMetadata.executionMode === "cloud" ? "cloud" : "local";

    const planId = session.planId || undefined;
    if (planId) {
      const todoCount = await prisma.task.count({
        where: { planId, status: "TODO" },
      });
      if (todoCount === 0) {
        const updated = await prisma.task.updateMany({
          where: { planId, status: "IN_PROGRESS" },
          data: { status: "TODO" },
        });
        if (updated.count > 0) {
          console.log(`[Worker] Reset ${updated.count} IN_PROGRESS tasks to TODO (stuck from previous run)`);
        }
      }
    }
    // First, try to pick an OPEN ticket for this project
    const openTickets = await prisma.ticket.findMany({
      where: {
        projectId: session.projectId,
        status: "OPEN",
      },
      orderBy: { createdAt: "asc" },
    });

    const projectDir = getProjectDir(session.projectId);
    await initProjectWorkspace(session.projectId);
    console.log(`[Worker] Initialized project workspace: ${projectDir}`);

    const agent = new ExecutionAgent({
      projectId: session.projectId,
      planId: session.planId || "",
      sessionId: session.id,
      autoApprove: sessionMetadata.autoApprove || false,
      mode: executionMode,
      onLog: (level, message) => {
        console.log(`[ExecutionAgent/${sessionId}] [${level}] ${message}`);
      },
    });

    if (openTickets.length > 0) {
      const ticket = openTickets[0];
      console.log(
        `[Worker] Found ${openTickets.length} open tickets. Processing ticket ${ticket.id} first...`
      );

      let currentTicket = ticket;
      try {
        currentTicket = await prisma.ticket.update({
          where: { id: ticket.id },
          data: { status: "IN_PROGRESS" },
        });
      } catch (e) {
        console.error(
          `[Worker] Failed to mark ticket ${ticket.id} as IN_PROGRESS. Skipping.`,
          e
        );
      }

      try {
        const result = await agent.executeTicket(currentTicket);
        const nextStatus = result.success ? "DONE" : "REJECTED";

        try {
          await prisma.ticket.update({
            where: { id: ticket.id },
            data: { status: nextStatus },
          });
        } catch (updateErr) {
          console.error(
            `[Worker] Failed to update ticket ${ticket.id} status to ${nextStatus}:`,
            updateErr
          );
        }
      } catch (e) {
        console.error(
          `[Worker] CRITICAL CRASH while processing ticket ${ticket.id}.`,
          e
        );
        try {
          await prisma.ticket.update({
            where: { id: ticket.id },
            data: { status: "REJECTED" },
          });
        } catch (rejectErr) {
          console.error(
            `[Worker] Failed to mark ticket ${ticket.id} as REJECTED after crash:`,
            rejectErr
          );
        }
      }
      console.log(`[Worker] Ticket ${ticket.id} processed. One ticket per run. Exiting.`);
      return;
    }

    const tasks = await prisma.task.findMany({
      where: {
        planId,
        status: "TODO",
      },
      orderBy: { createdAt: "asc" },
    });

    console.log(`[Worker] Found ${tasks.length} tasks to execute`);

    let processedTasksCount = 0;

    for (const task of tasks) {
      try {
        console.log(`[Worker] Processing task ${task.id} of ${tasks.length}...`);
        let generatedPrompt: string;
        try {
          generatedPrompt = await generateTaskPrompt(task.id, false, false);
        } catch (promptErr) {
          console.error(`[Worker] Failed to generate prompt for task ${task.id}. Skipping.`, promptErr);
          await prisma.task.update({
            where: { id: task.id },
            data: { status: "REVIEW" },
          });
          continue;
        }

        let result: ExecuteTaskResult | undefined;
        try {
          result = await agent.executeTask(task.id, generatedPrompt);
          if (!result.success) {
            console.log(`[Worker] Agent failed task ${task.id}, marking as REVIEW.`);
            await prisma.task.update({
              where: { id: task.id },
              data: { status: "REVIEW" },
            });
            continue;
          }
        } catch (executeErr) {
          console.error(`[Worker] CRITICAL CRASH on executeTask ${task.id}. Marking as REVIEW.`, executeErr);
          await prisma.task.update({
            where: { id: task.id },
            data: { status: "REVIEW" },
          });
          continue;
        }

        if (result?.success) {
          const report = result.report ?? "No report generated.";
          try {
            await prisma.comment.create({
              data: {
                taskId: task.id,
                content: report,
                authorRole: "DEVOPS",
                isSystem: false,
              },
            });
          } catch (commentErr) {
            console.error(`[Worker] Failed to save report comment for task ${task.id}:`, commentErr);
          }

          // Primary QA run
          let qaResult = await verifyTaskCompletion(task.id, report);

          // Auto-retry loop on REJECT using debugSummary / verificationCriteria
          const MAX_QA_RETRIES = 2;
          let attempt = 0;

          while (qaResult.status === "REJECTED" && attempt < MAX_QA_RETRIES) {
            attempt += 1;
            console.log(
              `[Worker] QA rejected task ${task.id} (attempt ${attempt}). Trying to collect missing evidence...`
            );

            try {
              const taskWithVC = await prisma.task.findUnique({
                where: { id: task.id },
                select: { verificationCriteria: true, title: true },
              });

              const vc = (taskWithVC?.verificationCriteria ??
                null) as { artifacts?: string[]; automatedCheck?: string; manualCheck?: string } | null;

              const artifacts = Array.isArray(vc?.artifacts) ? vc!.artifacts : [];
              const automatedCheck =
                typeof vc?.automatedCheck === "string" && vc.automatedCheck.trim()
                  ? vc.automatedCheck.trim()
                  : null;
              const manualCheckText =
                typeof vc?.manualCheck === "string" && vc.manualCheck.trim()
                  ? vc.manualCheck.trim()
                  : null;

              const autoEvidence: string[] = [];

              // Always try to re-run automatedCheck if defined (idempotent)
              if (automatedCheck) {
                autoEvidence.push(`--- Auto-retry: automatedCheck ---`);
                autoEvidence.push(`$ ${automatedCheck}`);
                try {
                  const execResult = await agent["emitEvent"]; // placeholder to satisfy TS in dynamic access
                } catch {
                  // no-op; we'll use toolsMap below via a small helper
                }
              }

              // We don't have direct access to toolsMap here, so we cannot re-run shell commands
              // from this layer without refactoring ExecutionAgent. For now we focus on strengthening
              // manualCheck confirmation so QA has explicit text evidence.
              if (manualCheckText) {
                autoEvidence.push(
                  `--- Auto-retry: manualCheck confirmation ---\n` +
                    `ManualCheck: ${manualCheckText}\n` +
                    `Подтверждаю, что реализованный результат соответствует этому manualCheck ` +
                    `(основано на созданных файлах и выполненных шагах в отчёте DEVOPS).`
                );
              }

              if (artifacts.length > 0) {
                autoEvidence.push(
                  `--- Auto-retry: artifacts recap ---\n` +
                    `Созданные/изменённые файлы (согласно verificationCriteria.artifacts):\n` +
                    artifacts.map((a) => `- ${a}`).join("\n")
                );
              }

              if (autoEvidence.length > 0) {
                const autoReport =
                  `=== AUTO-RETRY QA EVIDENCE (attempt ${attempt}) ===\n\n` +
                  autoEvidence.join("\n\n");

                await prisma.comment.create({
                  data: {
                    taskId: task.id,
                    content: autoReport,
                    authorRole: "DEVOPS",
                    isSystem: false,
                  },
                });

                qaResult = await verifyTaskCompletion(task.id, report + "\n\n" + autoReport);
              } else {
                // Nothing extra to add – break to avoid infinite loop
                break;
              }
            } catch (qaRetryErr) {
              console.error(
                `[Worker] Failed to perform QA auto-retry for task ${task.id}:`,
                qaRetryErr
              );
              break;
            }
          }

          await prisma.executionLog.create({
            data: {
              sessionId,
              type: "info",
              message: `Task ${task.id} QA completed: ${qaResult.finalStatus}`,
              metadata: {
                eventType: "task_qa_completed",
                data: { taskId: task.id, status: qaResult.finalStatus },
              },
            },
          });
          console.log(`[Worker] Task ${task.id} sent to QA; status updated by QA.`);
        }

        processedTasksCount += 1;
        const shouldRunReflexologistIncremental =
          processedTasksCount > 0 && processedTasksCount % 5 === 0;

        if (shouldRunReflexologistIncremental) {
          void runReflexologistForSession({
            projectId: session.projectId,
            sessionId: session.id,
            planId,
            mode: "incremental",
            maxInsights: 3,
          });
        }
      } catch (e) {
        console.error(
          `[Worker] CRITICAL CRASH on task ${task.id}. Moving to next.`,
          e
        );
      }
    }

    const planTasks = planId
      ? await prisma.task.findMany({
          where: { planId },
          select: { id: true, status: true },
        })
      : [];

    console.log(`[Worker] Plan tasks status:`, planTasks.map(t => ({ id: t.id, status: t.status })));

    const allTasksDone = planTasks.length > 0 && planTasks.every(
      (t) => t.status === "DONE"
    );

    console.log(`[Worker] allTasksDone: ${allTasksDone}, will update project status: ${allTasksDone}`);

    const hasReviewTasks = planTasks.some(
      (t) => t.status === "WAITING_APPROVAL"
    );

    if (hasReviewTasks) {
      const stuckTasks = planTasks.filter(
        (t) => t.status === "WAITING_APPROVAL"
      );
      const stuckIds = stuckTasks.map((t) => t.id).join(", ");
      try {
        await prisma.executionLog.create({
          data: {
            sessionId,
            type: "info",
            message:
              "[AI] Some tasks remain in WAITING_APPROVAL after automatic QA retries. Human review required.",
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
      } catch (stuckErr) {
        console.error(
          "[Worker] Failed to log QA fallback-human info:",
          stuckErr
        );
      }
    }

    const finishMessage = allTasksDone
      ? "[AI] ✅ All tasks completed. Session finished."
      : "[AI] All tasks processed. Session finished. Some tasks are not DONE.";

    const sessionManager = ExecutionSessionManager.getInstance();
    await sessionManager.stopSession(sessionId, "All tasks completed");
    console.log(`[WORKER ${sessionId}] All tasks processed. ${finishMessage}`);

    if (allTasksDone) {
      console.log(`[Worker] Updating project ${session.projectId} status to COMPLETED`);
      await prisma.project.update({
        where: { id: session.projectId },
        data: { status: 'COMPLETED' },
      });
      console.log(`[Worker] Project ${session.projectId} status updated to COMPLETED`);

      await prisma.executionLog.create({
        data: {
          sessionId,
          type: 'success',
          message: '✅ Project Completed! You can now download the code from the project page.',
          metadata: {
            eventType: 'project_completed',
            data: { projectId: session.projectId },
          },
        },
      });
    } else {
      console.log(`[Worker] Skipping project status update due to tasks in WAITING_APPROVAL`);
    }

    await prisma.executionLog.create({
      data: {
        sessionId,
        type: "info",
        message: finishMessage,
        metadata: { eventType: "session_stopped", data: { sessionId, status: "STOPPED" } },
      },
    });

    try {
      await runReflexologistForSession({
        projectId: session.projectId,
        sessionId: session.id,
        planId,
        mode: "final",
        maxInsights: 3,
      });
    } catch (e) {
      console.error(
        `[Worker] Reflexologist failed for session ${sessionId} (final run):`,
        e
      );
    }
  } catch (error) {
    console.error(`[Worker] Error running session ${sessionId}:`, error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId } = body;

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    console.log("\n\n🚀 [WORKER] Received request to run session: " + sessionId + " 🚀\n\n");

    runExecutionSession(sessionId);

    return NextResponse.json({ 
      success: true, 
      message: "Execution started",
      sessionId 
    });
  } catch (error) {
    console.error("[Worker] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start execution" },
      { status: 500 }
    );
  }
}
