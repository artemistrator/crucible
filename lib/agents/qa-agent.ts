import { BaseAgent, AgentConfig } from "./base-agent";
import { AgentMessage, AgentRole, MessageType } from "@prisma/client";
import { verifyTaskCompletion } from "./qa";

export class QAAgent extends BaseAgent {
  constructor(config: AgentConfig) {
    super({ ...config, agentRole: AgentRole.QA });
  }

  async processMessage(message: AgentMessage): Promise<Record<string, unknown>> {
    switch (message.eventType) {
      case MessageType.QA_REQUEST:
        return await this.handleQARequest(message);
      default:
        this.log("info", `[QA] Ignored unknown event type: ${message.eventType}`);
        return {};
    }
  }

  private async handleQARequest(message: AgentMessage): Promise<Record<string, unknown>> {
    const { taskId, report, ticketId } = message.payload as { taskId: string; report: string; ticketId?: string };

    this.log("info", `\n🧐 [QA] -> @TASK_EXECUTOR: "Взял твой код на проверку. Сейчас посмотрим, что ты там написал..."`);
    this.log("info", `[QA] Verifying task ${taskId}${ticketId ? ` (ticket ${ticketId})` : ""}`);

    const result = await verifyTaskCompletion(taskId, report);

    if (result.finalStatus === "DONE" || result.finalStatus === "WAITING_APPROVAL") {
      this.log("info", `\n✅ [QA] -> @TEAMLEAD: "Проверил, всё работает как часы. Апрув."`);
    } else {
      const reasonPreview = (result.reasoning ?? "").slice(0, 200);
      this.log("info", `\n🛑 [QA] -> @TEAMLEAD: "Код не прошел проверку! Причина: ${reasonPreview}${reasonPreview.length >= 200 ? "…" : ""}. Возвращаю."`);
    }

    await this.sendMessage(
      AgentRole.TEAMLEAD,
      MessageType.QA_RESPONSE,
      {
        taskId,
        status: result.status,
        reasoning: result.reasoning,
        finalStatus: result.finalStatus,
        confidence: result.confidence,
        ...(ticketId ? { ticketId } : {}),
      },
      message.id
    );

    this.log("info", `[QA] Task ${taskId} verification result: ${result.finalStatus}`);

    return result;
  }
}
