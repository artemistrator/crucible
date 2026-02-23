import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "../generate-tasks/route";

const FAKE_VECTOR = [0.1, 0.2, 0.3];
const FAKE_INSIGHT = {
  id: "insight-1",
  title: "Test Insight",
  category: "ARCHITECTURE",
  recommendation: "Always use TypeScript",
  content: null,
  embedding: JSON.stringify(FAKE_VECTOR),
};

vi.mock("@/lib/ai/embeddings", () => ({
  generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  cosineSimilarity: vi.fn().mockReturnValue(0.9),
}));

const mockPlanFindUnique = vi.fn();
const mockTaskFindMany = vi.fn();
const mockGlobalInsightFindMany = vi.fn();
const mockPlanUpdate = vi.fn();
const mockTransaction = vi.fn();
const mockTaskCreate = vi.fn();
const mockTaskUpdate = vi.fn();
const mockTaskDependencyCreate = vi.fn();
const mockTaskFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    plan: {
      findUnique: (...args: unknown[]) => mockPlanFindUnique(...args),
      update: (...args: unknown[]) => mockPlanUpdate(...args),
    },
    task: {
      findMany: (...args: unknown[]) => mockTaskFindMany(...args),
      findUnique: (...args: unknown[]) => mockTaskFindUnique(...args),
    },
    globalInsight: {
      findMany: (...args: unknown[]) => mockGlobalInsightFindMany(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

vi.mock("ai", () => ({
  generateText: vi.fn().mockResolvedValue({ text: "{}" }),
}));

const mockGenerateTextZai = vi.fn().mockResolvedValue(
  '{"estimatedComplexity":"M","reasoning":"test","tasks":[]}'
);

vi.mock("@/lib/ai/zai", () => ({
  generateTextZai: (...args: unknown[]) => mockGenerateTextZai(...args),
}));

vi.mock("@/lib/settings", () => ({
  getLLMSettings: vi.fn().mockResolvedValue({
    maxTokens: 4096,
    temperature: 0.2,
    defaultProvider: "zai",
    defaultModel: "glm-4.7",
  }),
}));

vi.mock("@/lib/ai/providers", () => ({
  getModel: vi.fn(() => ({})),
  resolveProvider: vi.fn((p: string) => p || "zai"),
  getProviderApiKey: vi.fn(() => "fake-zai-key"),
}));

vi.mock("@/lib/agents/project-context", () => ({
  getCompactProjectContext: vi.fn().mockResolvedValue(""),
}));

vi.mock("@/lib/agents/doc-writer", () => ({
  generateADR: vi.fn().mockResolvedValue("# ADR"),
  saveDocToClient: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/ai/call", () => ({
  trackAIUsage: vi.fn().mockResolvedValue(undefined),
}));

describe("RAG Pipeline Integration (generate-tasks)", () => {
  const planId = "plan-rag-test-1";
  const projectId = "proj-rag-test-1";

  const mockPlan = {
    id: planId,
    projectId,
    title: "Test Plan",
    techStack: "Next.js TypeScript",
    description: "Test",
    project: {
      id: projectId,
      aiProvider: "zai",
      aiModel: "glm-4.7",
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPlanFindUnique.mockResolvedValue(mockPlan);
    mockTaskFindMany.mockResolvedValue([]);
    mockPlanUpdate.mockResolvedValue(undefined);
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const mockTx = {
        task: {
          create: mockTaskCreate.mockResolvedValue({ id: "task-1" }),
          update: mockTaskUpdate.mockResolvedValue({}),
        },
        taskDependency: {
          create: mockTaskDependencyCreate.mockResolvedValue({}),
        },
      };
      return fn(mockTx);
    });
  });

  it("generate-tasks: system prompt contains CRITICAL LESSONS and injected insight when insights exist", async () => {
    mockGlobalInsightFindMany.mockImplementation((arg: { where?: unknown }) => {
      if (arg?.where && typeof arg.where === "object" && "embedding" in arg.where) {
        return Promise.resolve([FAKE_INSIGHT]);
      }
      return Promise.resolve([]);
    });

    const req = new Request("http://localhost/api/generate-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(mockGenerateTextZai).toHaveBeenCalled();
    const call = vi.mocked(mockGenerateTextZai).mock.calls[0];
    expect(call).toBeDefined();
    const [options] = call ?? [];
    expect(options).toMatchObject({
      model: "glm-4.7",
      systemPrompt: expect.stringContaining("### CRITICAL LESSONS LEARNED FROM PAST PROJECTS:"),
    });
    expect(options?.systemPrompt).toContain("[ARCHITECTURE] Test Insight: Always use TypeScript");
  });

  it("generate-tasks: system prompt does NOT contain CRITICAL LESSONS when insights are empty", async () => {
    mockGlobalInsightFindMany.mockResolvedValue([]);

    const req = new Request("http://localhost/api/generate-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(mockGenerateTextZai).toHaveBeenCalled();
    const call = vi.mocked(mockGenerateTextZai).mock.calls[0];
    const [options] = call ?? [];
    expect(options?.systemPrompt).not.toContain("### CRITICAL LESSONS LEARNED FROM PAST PROJECTS:");
  });
});
