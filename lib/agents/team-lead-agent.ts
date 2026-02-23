import { BaseAgent, AgentConfig } from "./base-agent";
import { AgentMessage, AgentRole, MessageType } from "@prisma/client";
import { quickReview } from "./architect";
import { prisma } from "@/lib/prisma";

export class TeamLeadAgent extends BaseAgent {
  constructor(config: AgentConfig) {
    super({ ...config, agentRole: AgentRole.TEAMLEAD });
  }

  async processMessage(message: AgentMessage): Promise<Record<string, unknown>> {
    console.log("[TeamLead] processMessage", message.eventType, message.id);
    switch (message.eventType) {
      case MessageType.ARCHITECT_REQUEST:
        return await this.handleArchitectRequest(message);
      case MessageType.QA_RESPONSE:
        return await this.handleQAResponse(message);
      case MessageType.STYLE_RESPONSE:
        return await this.handleStyleResponse(message);
      default:
        throw new Error(`Unknown event type: ${message.eventType}`);
    }
  }

  private async handleArchitectRequest(message: AgentMessage): Promise<Record<string, unknown>> {
    const { completedTaskId } = message.payload as { completedTaskId: string };

    this.log("info", `[TeamLead] Running quick review after task ${completedTaskId}`);
    console.log("[TeamLead] handleArchitectRequest", { completedTaskId });

    const result = await quickReview(this.config.projectId, completedTaskId);

    return result;
  }

  private async handleQAResponse(message: AgentMessage): Promise<Record<string, unknown>> {
    const { taskId, finalStatus, ticketId, reasoning } = message.payload as {
      taskId: string;
      finalStatus: string;
      ticketId?: string;
      reasoning?: string;
    };

    this.log("info", `[TeamLead] QA result for task ${taskId}: ${finalStatus}${ticketId ? ` (ticket ${ticketId})` : ""}`);
    console.log("[TeamLead] handleQAResponse", { taskId, finalStatus, ticketId });

    if (ticketId) {
      try {
        if (finalStatus === "DONE") {
          await prisma.ticket.update({
            where: { id: ticketId },
            data: { status: "DONE" },
          });
          this.log("info", `\n🎉 [TEAMLEAD] -> @ALL: "Отличная работа! QA принял задачу. Иду за следующей..."`);
          this.log("info", `[TeamLead] Updated ticket ${ticketId} status to DONE (from QA)`);
          console.log("[TeamLead] ticket updated", { ticketId, ticketStatus: "DONE" });
        } else {
          // Strict ticket gating: REJECTED -> reopen for retry (max 3), or REJECTED if retries exhausted
          const ticket = await prisma.ticket.findUnique({
            where: { id: ticketId },
            select: { description: true, retryCount: true, relatedTaskId: true },
          });
          if (!ticket) {
            this.log("error", `[TeamLead] Ticket ${ticketId} not found`);
            return { acknowledged: true };
          }
          const qaComment =
            (typeof reasoning === "string" && reasoning.trim()) ||
            (
              await prisma.comment.findFirst({
                where: { taskId, authorRole: "QA" },
                orderBy: { createdAt: "desc" },
                select: { content: true },
              })
            )?.content ||
            "QA rejected. No comment provided.";
          const retryCount = (ticket.retryCount ?? 0) + 1;
          const maxRetries = 3;
          if (retryCount > maxRetries) {
            await prisma.ticket.update({
              where: { id: ticketId },
              data: { status: "REJECTED" },
            });
            this.log("info", `[TeamLead] Ticket ${ticketId} REJECTED after ${retryCount} retries (max ${maxRetries})`);
            console.log("[TeamLead] ticket rejected (max retries)", { ticketId, retryCount });
          } else {
            const newDescription =
              (ticket.description || "") +
              "\n\n--- FAILED QA RETRY ---\n" +
              qaComment;
            await prisma.ticket.update({
              where: { id: ticketId },
              data: {
                status: "OPEN",
                description: newDescription,
                retryCount,
              },
            });
            this.log("info", `[TeamLead] Ticket ${ticketId} reopened for retry ${retryCount}/${maxRetries}; QA comment appended`);
            console.log("[TeamLead] ticket reopened for retry", { ticketId, retryCount, maxRetries });
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.log("error", `[TeamLead] Failed to update ticket ${ticketId}: ${msg}`);
        console.error("[TeamLead] Failed to update ticket", ticketId, err);
      }
    }

    if (finalStatus !== "DONE" && !ticketId) {
      try {
        const task = await prisma.task.findUnique({
          where: { id: taskId },
          include: { plan: { select: { projectId: true } } },
        });
        if (task?.plan) {
          const qaComment = await prisma.comment.findFirst({
            where: { taskId, authorRole: "QA" },
            orderBy: { createdAt: "desc" },
            select: { content: true },
          });
          await prisma.ticket.create({
            data: {
              projectId: task.plan.projectId,
              relatedTaskId: task.id,
              title: `QA Rejection: ${task.title}`,
              description: qaComment?.content ?? "Task rejected by QA. Please fix the issues and try again.",
              status: "OPEN",
            },
          });
          this.log("info", `\n⚠️ [TEAMLEAD] -> @TASK_EXECUTOR: "QA завернул твой код. Я создал баг-тикет. Бросай всё и иди чинить!"`);
          this.log("info", `[TeamLead] Created fixing ticket for rejected task ${task.id}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.log("error", `[TeamLead] Failed to create fixing ticket for task ${taskId}: ${msg}`);
      }
    }

    if (finalStatus === "DONE" && !ticketId) {
      this.log("info", `\n🎉 [TEAMLEAD] -> @ALL: "Отличная работа! QA принял задачу. Иду за следующей..."`);
      console.log("[TeamLead] triggering next task after", taskId);
      await this.triggerNextTask(taskId);
    }

    return { acknowledged: true };
  }

  private async handleStyleResponse(message: AgentMessage): Promise<Record<string, unknown>> {
    const { taskId, filePath, improvedContent, reasoning } = message.payload as {
      taskId: string;
      filePath: string;
      improvedContent: string;
      reasoning: string;
    };

    this.log("info", `[TeamLead] CSS improvements received for ${filePath}`);
    console.log("[TeamLead] handleStyleResponse", { taskId, filePath });

    await prisma.comment.create({
      data: {
        taskId,
        content: `🎨 CSS Improvements Applied\n\nFile: ${filePath}\n\nReasoning:\n${reasoning}\n\nImproved content is ready for write.`,
        authorRole: "TEAMLEAD",
        isSystem: true,
      },
    });

    return { acknowledged: true };
  }

  private async triggerNextTask(completedTaskId: string): Promise<void> {
    this.log("info", `[TeamLead] Finding next task after ${completedTaskId}`);
    console.log("[TeamLead] triggerNextTask", { completedTaskId });

    const completedTask = await prisma.task.findUnique({
      where: { id: completedTaskId },
      select: { planId: true },
    });

    if (!completedTask) {
      console.log("[TeamLead] completed task not found");
      return;
    }

    const nextTask = await prisma.task.findFirst({
      where: {
        planId: completedTask.planId,
        status: "TODO",
      },
      orderBy: { createdAt: "asc" },
    });

    if (!nextTask) {
      this.log("info", `\n🏆 [TEAMLEAD] -> @ALL: "Господа, мы закончили проект! Всем спасибо, расходимся."`);
      this.log("info", `[TeamLead] No more TODO tasks found`);
      console.log("[TeamLead] no more TODO tasks");
      return;
    }

    this.log("info", `[TeamLead] Triggering next task: ${nextTask.title} (${nextTask.id})`);
    console.log("[TeamLead] triggering next task", { nextTaskId: nextTask.id, title: nextTask.title });

    await this.sendMessage(
      nextTask.executorAgent || AgentRole.TASK_EXECUTOR,
      MessageType.TASK_REQUEST,
      { taskId: nextTask.id }
    );
  }
}
