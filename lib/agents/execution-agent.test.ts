import { describe, it, expect, vi, beforeEach } from "vitest";

const mockLog = vi.fn();

vi.mock("ai", () => ({
  generateText: vi.fn(),
}));

vi.mock("@/lib/ai/zai", () => ({
  generateTextZai: vi.fn().mockResolvedValue(""),
}));

vi.mock("@/lib/ai/providers", () => ({
  getModel: vi.fn(() => ({})),
  resolveProvider: vi.fn(() => "openai"),
}));

vi.mock("@/lib/ai/call", () => ({
  trackAIUsage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./project-context", () => ({
  getCompactProjectContext: vi.fn().mockResolvedValue(""),
}));

vi.mock("@/lib/execution/session-manager", () => ({
  ExecutionSessionManager: {
    getInstance: vi.fn(() => ({
      incrementRetryCounter: vi.fn().mockResolvedValue(undefined),
      checkRetryLimit: vi.fn().mockResolvedValue({ shouldPause: false, reason: "" }),
      pauseSession: vi.fn().mockResolvedValue(undefined),
    })),
  },
}));

vi.mock("./tools", () => ({
  createExecuteCommandTool: vi.fn(() => ({ execute: vi.fn().mockResolvedValue(undefined) })),
  createCloudExecuteCommandTool: vi.fn(() => ({ execute: vi.fn().mockResolvedValue(undefined) })),
  createReadFileTool: vi.fn(() => ({ execute: vi.fn().mockResolvedValue(undefined) })),
  createWriteFileTool: vi.fn(() => ({ execute: vi.fn().mockResolvedValue(undefined) })),
  createSearchKnowledgeTool: vi.fn(() => ({ execute: vi.fn().mockResolvedValue(undefined) })),
  webSearch: { execute: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    task: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
    },
    executionLog: {
      create: vi.fn().mockResolvedValue(undefined),
    },
    comment: {
      create: vi.fn().mockResolvedValue(undefined),
    },
    syncCommand: {
      findUnique: vi.fn(),
    },
    setting: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

import { generateText } from "ai";
import { ExecutionAgent } from "./execution-agent";
import { prisma } from "@/lib/prisma";

describe("ExecutionAgent", () => {
  const taskId = "task-1";
  const mockTask = {
    id: taskId,
    title: "Test task",
    description: "Test description",
    status: "PENDING",
    planId: "plan-1",
    plan: {
      id: "plan-1",
      projectId: "proj-1",
      project: {
        id: "proj-1",
        aiProvider: "openai",
        aiModel: "gpt-4o-mini",
      },
    },
    dependencies: [],
  };

  beforeEach(() => {
    mockLog.mockClear();
    vi.mocked(prisma.task.findUnique).mockResolvedValue(mockTask as any);
  });

  describe("executeTask", () => {
    it("Happy Path: logs thought and writeFile step", async () => {
      const planJson = JSON.stringify({
        steps: [
          { thought: "Test thought" },
          { toolName: "writeFile", params: { filePath: "test.ts", content: "// test" } },
        ],
      });
      vi.mocked(generateText)
        .mockResolvedValueOnce({ text: planJson } as any)
        .mockResolvedValueOnce({ text: "Report: created test.ts" } as any);

      const agent = new ExecutionAgent({
        projectId: "proj-1",
        planId: "plan-1",
        mode: "local",
        onLog: mockLog,
      });

      const result = await agent.executeTask(taskId);

      expect(result).toEqual({ success: true, report: expect.any(String) });
      expect(mockLog).toHaveBeenCalledWith("info", expect.stringContaining("Test thought"));
      expect(mockLog).toHaveBeenCalledWith("info", expect.stringContaining("writeFile"));
    });

    it("Invalid Response: does not throw, logs error about invalid plan", async () => {
      vi.mocked(generateText).mockResolvedValue({ text: "not valid json {" } as any);

      const agent = new ExecutionAgent({
        projectId: "proj-1",
        planId: "plan-1",
        mode: "local",
        onLog: mockLog,
      });

      const result = await agent.executeTask(taskId);
      expect(result).toEqual({ success: false });
      expect(mockLog).toHaveBeenCalledWith("error", expect.stringContaining("Failed to parse AI plan:"));
    });

    it("Null Response: does not throw with 'Cannot read properties of null', logs error", async () => {
      vi.mocked(generateText).mockResolvedValue(null as any);

      const agent = new ExecutionAgent({
        projectId: "proj-1",
        planId: "plan-1",
        mode: "local",
        onLog: mockLog,
      });

      const result = await agent.executeTask(taskId);
      expect(result).toEqual({ success: false });
      expect(mockLog).toHaveBeenCalledWith("error", "AI returned null");
    });
  });
});
