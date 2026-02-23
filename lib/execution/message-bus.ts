import { prisma } from "@/lib/prisma";
import { AgentRole, MessageType, MessageStatus, AgentMessage } from "@prisma/client";
import { appendSessionLog } from "@/lib/execution/file-logger";

export interface NewMessage {
  sessionId: string;
  sourceAgent: AgentRole;
  targetAgent: AgentRole;
  eventType: MessageType;
  payload: Record<string, unknown>;
  correlationId?: string;
  replyToId?: string;
}

export class MessageBus {
  async postMessage(message: NewMessage): Promise<AgentMessage> {
    const correlationId = message.correlationId || this.generateCorrelationId();

    const taskRef =
      (message.payload as Record<string, unknown>)?.taskTitle ??
      (message.payload as Record<string, unknown>)?.taskId ??
      "—";
    appendSessionLog(
      message.sessionId,
      "info",
      `\n📨 [${message.sourceAgent}] -> @${message.targetAgent}: Отправил ${message.eventType} (Task: ${taskRef})`
    );

    return await prisma.agentMessage.create({
      data: {
        sessionId: message.sessionId,
        sourceAgent: message.sourceAgent,
        targetAgent: message.targetAgent,
        eventType: message.eventType,
        payload: message.payload as any,
        correlationId,
        replyToId: message.replyToId,
        status: MessageStatus.PENDING,
      },
    });
  }

  async getPendingMessagesFor(
    sessionId: string,
    agentType: AgentRole
  ): Promise<AgentMessage[]> {
    return await prisma.agentMessage.findMany({
      where: {
        sessionId,
        targetAgent: agentType,
        status: MessageStatus.PENDING,
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async markAsProcessing(messageId: string): Promise<void> {
    await prisma.agentMessage.update({
      where: { id: messageId },
      data: { status: MessageStatus.PROCESSING },
    });
  }

  async markAsProcessed(
    messageId: string,
    responsePayload?: Record<string, unknown>
  ): Promise<void> {
    await prisma.agentMessage.update({
      where: { id: messageId },
      data: {
        status: MessageStatus.PROCESSED,
        processedAt: new Date(),
        ...(responsePayload && { payload: responsePayload as any }),
      },
    });
  }

  async markAsFailed(messageId: string, error: string): Promise<void> {
    await prisma.agentMessage.update({
      where: { id: messageId },
      data: {
        status: MessageStatus.FAILED,
        error,
      },
    });
  }

  async getConversation(correlationId: string): Promise<AgentMessage[]> {
    return await prisma.agentMessage.findMany({
      where: { correlationId },
      orderBy: { createdAt: "asc" },
    });
  }

  private generateCorrelationId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export const messageBus = new MessageBus();
