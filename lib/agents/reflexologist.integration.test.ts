import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runReflexologistForSession } from "./reflexologist";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    executionSession: {
      findUnique: vi.fn(),
    },
    executionLog: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    task: {
      findMany: vi.fn(),
    },
    comment: {
      findMany: vi.fn(),
    },
    globalInsight: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    setting: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

vi.mock("ai", () => ({
  generateText: vi.fn(),
}));

vi.mock("@/lib/ai/zai", () => ({
  generateTextZai: vi.fn(),
}));

vi.mock("@/lib/ai/providers", () => ({
  getModel: vi.fn(() => ({})),
  resolveProvider: vi.fn(() => "openai"),
}));

vi.mock("@/lib/settings", () => ({
  getLLMSettings: vi.fn().mockResolvedValue({
    maxTokens: 2048,
    temperature: 0.2,
    defaultProvider: "openai",
    defaultModel: "gpt-4o-mini",
  }),
}));

const originalResolveProvider = vi.fn();

describe("Reflexologist Integration Tests", () => {
  const mockSessionId = "test-session-" + Date.now();
  const mockProjectId = "test-proj-" + Date.now();
  const mockPlanId = "test-plan-" + Date.now();

  const mockSession = {
    id: mockSessionId,
    project: {
      id: mockProjectId,
      aiProvider: "openai",
      aiModel: "gpt-4o-mini",
    },
    planId: mockPlanId,
    metadata: {},
  };

  const mockErrorLogs = [
    {
      id: "log-1",
      sessionId: mockSessionId,
      type: "error",
      message: "Task failed: module not found",
      metadata: { eventType: "task_failed", taskId: "task-1" },
      createdAt: new Date(),
    },
    {
      id: "log-2",
      sessionId: mockSessionId,
      type: "error",
      message: "Task failed: cannot import react",
      metadata: { eventType: "task_failed", taskId: "task-2" },
      createdAt: new Date(),
    },
  ];

  const mockTaskLogs = [
    {
      id: "log-3",
      sessionId: mockSessionId,
      type: "info",
      message: "Task task-1 started",
      metadata: { eventType: "task_started", taskId: "task-1" },
      createdAt: new Date(),
    },
  ];

  const mockTasks = [
    { id: "task-1", title: "Implement login" },
    { id: "task-2", title: "Implement dashboard" },
  ];

  const mockComments = [
    {
      id: "comment-1",
      taskId: "task-1",
      content: "QA rejected: Missing React imports",
      authorRole: "QA",
      isSystem: false,
      createdAt: new Date(),
    },
    {
      id: "comment-2",
      taskId: "task-2",
      content: "QA rejected: Component not exported",
      authorRole: "QA",
      isSystem: false,
      createdAt: new Date(),
    },
  ];

  const mockInsights = [
    {
      title: "Frequently Missing React Imports",
      summary: "The AI consistently forgets to import React components before using them, especially when creating new files.",
      category: "TOOLING",
      severity: "medium",
      appliesTo: {
        projectId: mockProjectId,
        planId: mockPlanId,
        sessionId: mockSessionId,
      },
      recommendation: "Implement a pre-flight check in the LLM prompt that reminds the AI to verify all imports are present before executing code.",
    },
  ];

  const mockCreatedInsight = {
    id: "insight-1",
    projectId: mockProjectId,
    planId: mockPlanId,
    sessionId: mockSessionId,
    title: "Frequently Missing React Imports",
    content: "The AI consistently forgets to import React components before using them, especially when creating new files.",
    category: "TOOLING",
    severity: "medium",
    recommendation: "Implement a pre-flight check in the LLM prompt that reminds the AI to verify all imports are present before executing code.",
    fingerprint: "tooling:frequently missing react imports",
    tags: [],
    createdAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Final Mode - With Signals", () => {
    it("should generate and save insights when errors exist", async () => {
      const { prisma: prismaMock } = await import("@/lib/prisma");

      vi.mocked(prismaMock.executionSession.findUnique).mockResolvedValue(mockSession as any);
      vi.mocked(prismaMock.executionLog.findMany).mockResolvedValue([...mockErrorLogs, ...mockTaskLogs] as any);
      vi.mocked(prismaMock.task.findMany).mockResolvedValue(mockTasks as any);
      vi.mocked(prismaMock.comment.findMany).mockResolvedValue(mockComments as any);
      vi.mocked(prismaMock.globalInsight.findFirst).mockResolvedValue(null);
      vi.mocked(prismaMock.globalInsight.create).mockResolvedValue(mockCreatedInsight as any);
      vi.mocked(prismaMock.executionLog.create).mockResolvedValue({} as any);

      const { generateText } = await import("ai");
      vi.mocked(generateText).mockResolvedValue({
        text: JSON.stringify(mockInsights),
      } as any);

      await runReflexologistForSession({
        projectId: mockProjectId,
        sessionId: mockSessionId,
        planId: mockPlanId,
        mode: "final",
        maxInsights: 3,
      });

      expect(prismaMock.executionSession.findUnique).toHaveBeenCalledWith({
        where: { id: mockSessionId },
        include: { project: true },
      });

      expect(prismaMock.executionLog.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          sessionId: mockSessionId,
        }),
        orderBy: { createdAt: "asc" },
        take: 150,
      });

      expect(prismaMock.task.findMany).toHaveBeenCalledWith({
        where: { planId: mockPlanId },
        select: { id: true, title: true },
      });

      expect(prismaMock.comment.findMany).toHaveBeenCalledWith({
        where: { taskId: { in: mockTasks.map((t) => t.id) } },
        orderBy: { createdAt: "asc" },
        take: 100,
      });

      expect(generateText).toHaveBeenCalledWith({
        model: expect.any(Object),
        system: expect.stringContaining("Senior Staff Engineer"),
        prompt: expect.stringContaining(mockProjectId),
        temperature: 0.1,
        maxTokens: 2048,
      });

      expect(prismaMock.globalInsight.findFirst).toHaveBeenCalledWith({
        where: {
          projectId: mockProjectId,
          fingerprint: expect.any(String),
        },
      });

      expect(prismaMock.globalInsight.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          projectId: mockProjectId,
          planId: mockPlanId,
          sessionId: mockSessionId,
          title: "Frequently Missing React Imports",
          content: "The AI consistently forgets to import React components before using them, especially when creating new files.",
          category: "TOOLING",
          severity: "medium",
          recommendation: "Implement a pre-flight check in the LLM prompt that reminds the AI to verify all imports are present before executing code.",
          fingerprint: "tooling:frequently missing react imports",
        }),
      });

      expect(prismaMock.executionLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sessionId: mockSessionId,
          type: "info",
          message: expect.stringContaining("Generated 1 insights (final run)"),
          metadata: expect.objectContaining({
            eventType: "reflexologist_run",
          }),
        }),
      });
    });

    it("should deduplicate insights by fingerprint", async () => {
      const { prisma: prismaMock } = await import("@/lib/prisma");

      vi.mocked(prismaMock.executionSession.findUnique).mockResolvedValue(mockSession as any);
      vi.mocked(prismaMock.executionLog.findMany).mockResolvedValue(mockErrorLogs as any);
      vi.mocked(prismaMock.task.findMany).mockResolvedValue(mockTasks as any);
      vi.mocked(prismaMock.comment.findMany).mockResolvedValue(mockComments as any);
      vi.mocked(prismaMock.globalInsight.findFirst).mockResolvedValue(null);
      vi.mocked(prismaMock.globalInsight.create).mockResolvedValue(mockCreatedInsight as any);
      vi.mocked(prismaMock.executionLog.create).mockResolvedValue({} as any);

      const { generateText } = await import("ai");
      vi.mocked(generateText).mockResolvedValue({
        text: JSON.stringify(mockInsights),
      } as any);

      await runReflexologistForSession({
        projectId: mockProjectId,
        sessionId: mockSessionId,
        planId: mockPlanId,
        mode: "final",
        maxInsights: 3,
      });

      expect(prismaMock.globalInsight.findFirst).toHaveBeenCalledWith({
        where: {
          projectId: mockProjectId,
          fingerprint: expect.any(String),
        },
      });

      expect(prismaMock.globalInsight.create).toHaveBeenCalledTimes(1);
    });

    it("should not create insight when fingerprint already exists", async () => {
      const { prisma: prismaMock } = await import("@/lib/prisma");

      vi.mocked(prismaMock.executionSession.findUnique).mockResolvedValue(mockSession as any);
      vi.mocked(prismaMock.executionLog.findMany).mockResolvedValue(mockErrorLogs as any);
      vi.mocked(prismaMock.task.findMany).mockResolvedValue(mockTasks as any);
      vi.mocked(prismaMock.comment.findMany).mockResolvedValue(mockComments as any);
      vi.mocked(prismaMock.globalInsight.findFirst).mockResolvedValue(mockCreatedInsight as any);
      vi.mocked(prismaMock.globalInsight.create).mockResolvedValue(mockCreatedInsight as any);
      vi.mocked(prismaMock.executionLog.create).mockResolvedValue({} as any);

      const { generateText } = await import("ai");
      vi.mocked(generateText).mockResolvedValue({
        text: JSON.stringify(mockInsights),
      } as any);

      await runReflexologistForSession({
        projectId: mockProjectId,
        sessionId: mockSessionId,
        planId: mockPlanId,
        mode: "final",
        maxInsights: 3,
      });

      expect(prismaMock.globalInsight.findFirst).toHaveBeenCalledWith({
        where: {
          projectId: mockProjectId,
          fingerprint: "tooling:frequently missing react imports",
        },
      });

      expect(prismaMock.globalInsight.create).not.toHaveBeenCalled();
      expect(prismaMock.executionLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sessionId: mockSessionId,
          type: "info",
          message: expect.stringContaining("Generated 0 insights"),
        }),
      });
    });
  });

  describe("Incremental Mode", () => {
    it("should skip incremental run when no signals exist", async () => {
      const { prisma: prismaMock } = await import("@/lib/prisma");

      vi.mocked(prismaMock.executionSession.findUnique).mockResolvedValue(mockSession as any);
      vi.mocked(prismaMock.executionLog.findMany).mockResolvedValue(mockTaskLogs as any);
      vi.mocked(prismaMock.task.findMany).mockResolvedValue(mockTasks as any);
      vi.mocked(prismaMock.comment.findMany).mockResolvedValue(mockComments as any);

      await runReflexologistForSession({
        projectId: mockProjectId,
        sessionId: mockSessionId,
        planId: mockPlanId,
        mode: "incremental",
        maxInsights: 3,
      });

      expect(prismaMock.executionSession.findUnique).toHaveBeenCalledWith({
        where: { id: mockSessionId },
        include: { project: true },
      });

      expect(prismaMock.executionLog.findMany).toHaveBeenCalled();

      const { generateText } = await import("ai");
      expect(generateText).not.toHaveBeenCalled();
    });

    it("should run incremental analysis when signals exist", async () => {
      const { prisma: prismaMock } = await import("@/lib/prisma");

      vi.mocked(prismaMock.executionSession.findUnique).mockResolvedValue(mockSession as any);
      vi.mocked(prismaMock.executionLog.findMany).mockResolvedValue([...mockErrorLogs, ...mockTaskLogs] as any);
      vi.mocked(prismaMock.task.findMany).mockResolvedValue(mockTasks as any);
      vi.mocked(prismaMock.comment.findMany).mockResolvedValue(mockComments as any);
      vi.mocked(prismaMock.globalInsight.findFirst).mockResolvedValue(null);
      vi.mocked(prismaMock.globalInsight.create).mockResolvedValue(mockCreatedInsight as any);
      vi.mocked(prismaMock.executionLog.create).mockResolvedValue({} as any);

      const { generateText } = await import("ai");
      vi.mocked(generateText).mockResolvedValue({
        text: JSON.stringify(mockInsights),
      } as any);

      await runReflexologistForSession({
        projectId: mockProjectId,
        sessionId: mockSessionId,
        planId: mockPlanId,
        mode: "incremental",
        maxInsights: 3,
      });

      expect(generateText).toHaveBeenCalledWith({
        model: expect.any(Object),
        system: expect.stringContaining("Senior Staff Engineer"),
        prompt: expect.stringContaining("incremental"),
        temperature: 0.1,
        maxTokens: 2048,
      });

      expect(prismaMock.executionLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          message: expect.stringContaining("Generated 1 insights (incremental run)"),
        }),
      });
    });
  });

  describe("Error Handling", () => {
    it("should handle empty LLM response gracefully", async () => {
      const { prisma: prismaMock } = await import("@/lib/prisma");

      vi.mocked(prismaMock.executionSession.findUnique).mockResolvedValue(mockSession as any);
      vi.mocked(prismaMock.executionLog.findMany).mockResolvedValue(mockErrorLogs as any);
      vi.mocked(prismaMock.task.findMany).mockResolvedValue(mockTasks as any);
      vi.mocked(prismaMock.comment.findMany).mockResolvedValue(mockComments as any);

      const { generateText } = await import("ai");
      vi.mocked(generateText).mockResolvedValue({
        text: "",
      } as any);

      await runReflexologistForSession({
        projectId: mockProjectId,
        sessionId: mockSessionId,
        planId: mockPlanId,
        mode: "final",
        maxInsights: 3,
      });

      expect(prismaMock.globalInsight.create).not.toHaveBeenCalled();
    });

    it("should handle invalid JSON from LLM gracefully", async () => {
      const { prisma: prismaMock } = await import("@/lib/prisma");

      vi.mocked(prismaMock.executionSession.findUnique).mockResolvedValue(mockSession as any);
      vi.mocked(prismaMock.executionLog.findMany).mockResolvedValue(mockErrorLogs as any);
      vi.mocked(prismaMock.task.findMany).mockResolvedValue(mockTasks as any);
      vi.mocked(prismaMock.comment.findMany).mockResolvedValue(mockComments as any);

      const { generateText } = await import("ai");
      vi.mocked(generateText).mockResolvedValue({
        text: "invalid json {{{",
      } as any);

      await runReflexologistForSession({
        projectId: mockProjectId,
        sessionId: mockSessionId,
        planId: mockPlanId,
        mode: "final",
        maxInsights: 3,
      });

      expect(prismaMock.globalInsight.create).not.toHaveBeenCalled();
    });

    it("should handle session not found gracefully", async () => {
      const { prisma: prismaMock } = await import("@/lib/prisma");

      vi.mocked(prismaMock.executionSession.findUnique).mockResolvedValue(null);

      const { generateText } = await import("ai");
      vi.mocked(generateText).mockResolvedValue({
        text: JSON.stringify(mockInsights),
      } as any);

      await runReflexologistForSession({
        projectId: mockProjectId,
        sessionId: mockSessionId,
        planId: mockPlanId,
        mode: "final",
        maxInsights: 3,
      });

      expect(prismaMock.executionLog.findMany).not.toHaveBeenCalled();
    });

    it("should log error when prisma operations fail", async () => {
      const { prisma: prismaMock } = await import("@/lib/prisma");

      vi.mocked(prismaMock.executionSession.findUnique).mockRejectedValue(new Error("Database connection failed"));
      vi.mocked(prismaMock.executionLog.create).mockResolvedValue({} as any);

      await runReflexologistForSession({
        projectId: mockProjectId,
        sessionId: mockSessionId,
        planId: mockPlanId,
        mode: "final",
        maxInsights: 3,
      });

      expect(prismaMock.executionLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sessionId: mockSessionId,
          type: "error",
          message: expect.stringContaining("Error while generating insights"),
          metadata: expect.objectContaining({
            eventType: "reflexologist_error",
          }),
        }),
      });
    });

    it("should handle LLM returning zero insights", async () => {
      const { prisma: prismaMock } = await import("@/lib/prisma");

      vi.mocked(prismaMock.executionSession.findUnique).mockResolvedValue(mockSession as any);
      vi.mocked(prismaMock.executionLog.findMany).mockResolvedValue(mockErrorLogs as any);
      vi.mocked(prismaMock.task.findMany).mockResolvedValue(mockTasks as any);
      vi.mocked(prismaMock.comment.findMany).mockResolvedValue(mockComments as any);

      const { generateText } = await import("ai");
      vi.mocked(generateText).mockResolvedValue({
        text: "[]",
      } as any);

      await runReflexologistForSession({
        projectId: mockProjectId,
        sessionId: mockSessionId,
        planId: mockPlanId,
        mode: "final",
        maxInsights: 3,
      });

      expect(prismaMock.globalInsight.create).not.toHaveBeenCalled();
    });
  });

  describe("Zai Provider Support", () => {
    it("should use generateTextZai when provider is zai", async () => {
      const { prisma: prismaMock } = await import("@/lib/prisma");
      const { resolveProvider } = await import("@/lib/ai/providers");

      const mockSessionWithZai = {
        ...mockSession,
        project: {
          ...mockSession.project,
          aiProvider: "zai",
          aiModel: "glm-4.7",
        },
      };

      vi.mocked(prismaMock.executionSession.findUnique).mockResolvedValue(mockSessionWithZai as any);
      vi.mocked(prismaMock.executionLog.findMany).mockResolvedValue(mockErrorLogs as any);
      vi.mocked(prismaMock.task.findMany).mockResolvedValue(mockTasks as any);
      vi.mocked(prismaMock.comment.findMany).mockResolvedValue(mockComments as any);
      vi.mocked(prismaMock.globalInsight.findFirst).mockResolvedValue(null);
      vi.mocked(prismaMock.globalInsight.create).mockResolvedValue(mockCreatedInsight as any);
      vi.mocked(prismaMock.executionLog.create).mockResolvedValue({} as any);

      const { generateTextZai } = await import("@/lib/ai/zai");
      vi.mocked(generateTextZai).mockResolvedValue(JSON.stringify(mockInsights));
      vi.mocked(resolveProvider).mockReturnValue("zai");

      await runReflexologistForSession({
        projectId: mockProjectId,
        sessionId: mockSessionId,
        planId: mockPlanId,
        mode: "final",
        maxInsights: 3,
      });

      expect(resolveProvider).toHaveBeenCalledWith("zai");
      expect(generateTextZai).toHaveBeenCalledWith({
        systemPrompt: expect.stringContaining("Senior Staff Engineer"),
        userMessage: expect.stringContaining(mockProjectId),
        model: "glm-4.7",
        temperature: 0.1,
        maxTokens: 2048,
      });

      expect(prismaMock.globalInsight.create).toHaveBeenCalled();
    });
  });

  describe("Edge Cases", () => {
    it("should handle session with no planId", async () => {
      const mockSessionNoPlan = {
        ...mockSession,
        planId: null,
      };

      const logsWithError = [
        {
          id: "log-no-plan",
          sessionId: mockSessionId,
          type: "error",
          message: "Fake error to trigger hasSignals",
          metadata: { eventType: "task_failed" },
          createdAt: new Date(),
        },
      ];

      vi.mocked(prisma.executionSession.findUnique).mockResolvedValue(mockSessionNoPlan as any);
      vi.mocked(prisma.executionLog.findMany).mockResolvedValue(logsWithError as any);
      vi.mocked(prisma.task.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.comment.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.globalInsight.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.globalInsight.create).mockResolvedValue(mockCreatedInsight as any);
      vi.mocked(prisma.executionLog.create).mockResolvedValue({} as any);

      const { generateText } = await import("ai");
      vi.mocked(generateText).mockResolvedValue({
        text: JSON.stringify(mockInsights),
      } as any);

      const { getModel, resolveProvider } = await import("@/lib/ai/providers");
      vi.mocked(resolveProvider).mockReturnValue("openai");
      vi.mocked(getModel).mockReturnValue({} as any);

      await runReflexologistForSession({
        projectId: mockProjectId,
        sessionId: mockSessionId,
        planId: null,
        mode: "final",
        maxInsights: 3,
      });

      expect(prisma.task.findMany).not.toHaveBeenCalled();
      expect(prisma.comment.findMany).not.toHaveBeenCalled();
      expect(generateText).toHaveBeenCalled();
    });

    it("should handle retryCounter in session metadata", async () => {
      const mockSessionWithRetries = {
        ...mockSession,
        metadata: {
          retryCounter: {
            "task-1": 2,
            "task-2": 3,
          },
          lastErrorSignature: "ModuleNotFoundError",
        },
      };

      const logsWithErrorForRetry = [
        {
          id: "log-retry",
          sessionId: mockSessionId,
          type: "error",
          message: "Fake error to trigger hasSignals",
          metadata: { eventType: "task_failed" },
          createdAt: new Date(),
        },
        ...mockTaskLogs,
      ];

      vi.mocked(prisma.executionSession.findUnique).mockResolvedValue(mockSessionWithRetries as any);
      vi.mocked(prisma.executionLog.findMany).mockResolvedValue(logsWithErrorForRetry as any);
      vi.mocked(prisma.task.findMany).mockResolvedValue(mockTasks as any);
      vi.mocked(prisma.comment.findMany).mockResolvedValue(mockComments as any);
      vi.mocked(prisma.globalInsight.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.globalInsight.create).mockResolvedValue(mockCreatedInsight as any);
      vi.mocked(prisma.executionLog.create).mockResolvedValue({} as any);

      const { generateText } = await import("ai");
      vi.mocked(generateText).mockResolvedValue({
        text: JSON.stringify(mockInsights),
      } as any);

      const { getModel, resolveProvider } = await import("@/lib/ai/providers");
      vi.mocked(resolveProvider).mockReturnValue("openai");
      vi.mocked(getModel).mockReturnValue({} as any);

      await runReflexologistForSession({
        projectId: mockProjectId,
        sessionId: mockSessionId,
        planId: mockPlanId,
        mode: "final",
        maxInsights: 3,
      });

      expect(generateText).toHaveBeenCalledWith({
        model: expect.any(Object),
        system: expect.stringContaining("Senior Staff Engineer"),
        prompt: expect.stringContaining("retryCounter"),
        temperature: 0.1,
        maxTokens: 2048,
      });

      expect(prisma.globalInsight.create).toHaveBeenCalled();
    });

    it("should filter logs by time (last hour) in incremental mode", async () => {
      const { prisma: prismaMock } = await import("@/lib/prisma");

      vi.mocked(prismaMock.executionSession.findUnique).mockResolvedValue(mockSession as any);
      vi.mocked(prismaMock.executionLog.findMany).mockResolvedValue(mockTaskLogs as any);
      vi.mocked(prismaMock.task.findMany).mockResolvedValue(mockTasks as any);
      vi.mocked(prismaMock.comment.findMany).mockResolvedValue(mockComments as any);

      await runReflexologistForSession({
        projectId: mockProjectId,
        sessionId: mockSessionId,
        planId: mockPlanId,
        mode: "incremental",
        maxInsights: 3,
      });

      expect(prismaMock.executionLog.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          sessionId: mockSessionId,
          createdAt: expect.objectContaining({
            gte: expect.any(Date),
          }),
        }),
        orderBy: { createdAt: "asc" },
        take: 150,
      });
    });
  });
});
