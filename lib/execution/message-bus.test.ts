import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { messageBus } from "./message-bus";
import { prisma } from "@/lib/prisma";
import { AgentRole, MessageType, MessageStatus } from "@prisma/client";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    agentMessage: {
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe("MessageBus", () => {
  const mockSessionId = "session-123";
  const mockMessage = {
    id: "msg-1",
    sessionId: mockSessionId,
    sourceAgent: AgentRole.TASK_EXECUTOR,
    targetAgent: AgentRole.QA,
    eventType: MessageType.TASK_REQUEST,
    payload: { taskId: "task-1" },
    status: MessageStatus.PENDING,
    correlationId: "corr-1",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("postMessage", () => {
    it("should create a new message with generated correlationId", async () => {
      vi.mocked(prisma.agentMessage.create).mockResolvedValue(mockMessage as any);

      const newMessage = {
        sessionId: mockSessionId,
        sourceAgent: AgentRole.TASK_EXECUTOR,
        targetAgent: AgentRole.QA,
        eventType: MessageType.TASK_REQUEST,
        payload: { taskId: "task-1" },
      };

      const result = await messageBus.postMessage(newMessage);

      expect(prisma.agentMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sessionId: mockSessionId,
          sourceAgent: AgentRole.TASK_EXECUTOR,
          targetAgent: AgentRole.QA,
          eventType: MessageType.TASK_REQUEST,
          payload: { taskId: "task-1" },
          status: MessageStatus.PENDING,
          correlationId: expect.stringMatching(/^msg_\d+_[a-z0-9]+$/),
          replyToId: undefined,
        }),
      });
      expect(result).toEqual(mockMessage);
    });

    it("should create a new message with provided correlationId", async () => {
      vi.mocked(prisma.agentMessage.create).mockResolvedValue(mockMessage as any);

      const newMessage = {
        sessionId: mockSessionId,
        sourceAgent: AgentRole.TASK_EXECUTOR,
        targetAgent: AgentRole.QA,
        eventType: MessageType.TASK_REQUEST,
        payload: { taskId: "task-1" },
        correlationId: "custom-corr-id",
      };

      await messageBus.postMessage(newMessage);

      expect(prisma.agentMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          correlationId: "custom-corr-id",
        }),
      });
    });
  });

  describe("getPendingMessagesFor", () => {
    it("should return pending messages for a specific agent", async () => {
      const mockMessages = [mockMessage, { ...mockMessage, id: "msg-2" }];
      vi.mocked(prisma.agentMessage.findMany).mockResolvedValue(mockMessages as any);

      const result = await messageBus.getPendingMessagesFor(
        mockSessionId,
        AgentRole.QA
      );

      expect(prisma.agentMessage.findMany).toHaveBeenCalledWith({
        where: {
          sessionId: mockSessionId,
          targetAgent: AgentRole.QA,
          status: MessageStatus.PENDING,
        },
        orderBy: { createdAt: "asc" },
      });
      expect(result).toHaveLength(2);
    });

    it("should return empty array when no messages found", async () => {
      vi.mocked(prisma.agentMessage.findMany).mockResolvedValue([]);

      const result = await messageBus.getPendingMessagesFor(
        mockSessionId,
        AgentRole.QA
      );

      expect(result).toEqual([]);
    });
  });

  describe("markAsProcessing", () => {
    it("should update message status to PROCESSING", async () => {
      vi.mocked(prisma.agentMessage.update).mockResolvedValue({} as any);

      await messageBus.markAsProcessing("msg-1");

      expect(prisma.agentMessage.update).toHaveBeenCalledWith({
        where: { id: "msg-1" },
        data: { status: MessageStatus.PROCESSING },
      });
    });
  });

  describe("markAsProcessed", () => {
    it("should update message status to PROCESSED with processedAt", async () => {
      vi.mocked(prisma.agentMessage.update).mockResolvedValue({} as any);

      await messageBus.markAsProcessed("msg-1");

      expect(prisma.agentMessage.update).toHaveBeenCalledWith({
        where: { id: "msg-1" },
        data: expect.objectContaining({
          status: MessageStatus.PROCESSED,
          processedAt: expect.any(Date),
        }),
      });
    });

    it("should update message status with responsePayload", async () => {
      vi.mocked(prisma.agentMessage.update).mockResolvedValue({} as any);

      const responsePayload = { result: "success" };
      await messageBus.markAsProcessed("msg-1", responsePayload);

      expect(prisma.agentMessage.update).toHaveBeenCalledWith({
        where: { id: "msg-1" },
        data: expect.objectContaining({
          payload: responsePayload,
        }),
      });
    });
  });

  describe("markAsFailed", () => {
    it("should update message status to FAILED with error", async () => {
      vi.mocked(prisma.agentMessage.update).mockResolvedValue({} as any);

      const errorMsg = "Something went wrong";
      await messageBus.markAsFailed("msg-1", errorMsg);

      expect(prisma.agentMessage.update).toHaveBeenCalledWith({
        where: { id: "msg-1" },
        data: {
          status: MessageStatus.FAILED,
          error: errorMsg,
        },
      });
    });
  });

  describe("getConversation", () => {
    it("should return all messages by correlationId ordered by createdAt", async () => {
      const mockConversation = [
        mockMessage,
        { ...mockMessage, id: "msg-2", eventType: MessageType.TASK_RESPONSE },
      ];
      vi.mocked(prisma.agentMessage.findMany).mockResolvedValue(mockConversation as any);

      const result = await messageBus.getConversation("corr-1");

      expect(prisma.agentMessage.findMany).toHaveBeenCalledWith({
        where: { correlationId: "corr-1" },
        orderBy: { createdAt: "asc" },
      });
      expect(result).toHaveLength(2);
    });
  });
});
