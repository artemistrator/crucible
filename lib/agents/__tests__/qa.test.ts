import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("ai", () => ({
  generateText: vi.fn(),
}));

vi.mock("@/lib/ai/providers", () => ({
  getModel: vi.fn(() => ({})),
  resolveProvider: vi.fn(() => "openai"),
}));

vi.mock("@/lib/ai/call", () => ({
  trackAIUsage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../project-context", () => ({
  getCompactProjectContext: vi.fn().mockResolvedValue(""),
}));

vi.mock("../tools", () => ({
  createAgentTools: vi.fn(() => ({})),
}));

vi.mock("../debug", () => ({
  analyzeRejectReason: vi.fn().mockResolvedValue({
    symptoms: { expected: "", actual: "", missing_evidence: "" },
  }),
}));

vi.mock("@/lib/qa-logger", () => ({
  logQA: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    task: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
    },
    comment: {
      create: vi.fn().mockResolvedValue(undefined),
    },
    setting: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

import { generateText } from "ai";
import { prisma } from "@/lib/prisma";
import { analyzeRejectReason } from "../debug";
import { verifyTaskCompletion } from "../qa";

const taskId = "task-qa-1";
const projectId = "proj-1";

const mockTask = {
  id: taskId,
  title: "Test QA task",
  description: "Test description",
  status: "PENDING",
  executorAgent: "CURSOR",
  verificationCriteria: {
    artifacts: ["src/app/page.tsx"],
    manualCheck: "Open in browser and confirm the page loads",
    automatedCheck: "sh .ai-temp-check.sh",
  },
  planId: "plan-1",
  plan: {
    id: "plan-1",
    title: "Test plan",
    techStack: "Next.js",
    projectId,
    project: {
      id: projectId,
      aiProvider: "openai",
      aiModel: "gpt-4o-mini",
      requireApproval: false,
    },
  },
  comments: [],
};

function headlessSuccessReport(): string {
  return `
=== IMPLEMENTATION REPORT ===

📁 Artifacts Check
\`\`\`bash
$ head -n 200 src/app/page.tsx
export default function Page() {
  return <div>Hello</div>;
}
\`\`\`

🤖 Automated Check
\`\`\`bash
$ sh .ai-temp-check.sh
PASS
exit 0
\`\`\`

### Manual Check
[HEADLESS MODE TRIGGERED]
В headless-окружении ручная проверка невозможна. Проверка отложена на пользователя.

=== END REPORT ===
`.trim();
}

function automatedCheckFailureReport(): string {
  return `
=== IMPLEMENTATION REPORT ===

📁 Artifacts Check
\`\`\`bash
$ cat src/app/page.tsx
export default function Page() { return <div>Hi</div>; }
\`\`\`

🤖 Automated Check
\`\`\`bash
$ sh .ai-temp-check.sh
npm run build
... error TS2307: Cannot find module ...
exit 1
\`\`\`

### Manual Check
[HEADLESS MODE TRIGGERED]
Deferred to user.

=== END REPORT ===
`.trim();
}

describe("verifyTaskCompletion (QA pipeline)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.task.findUnique).mockResolvedValue(mockTask as any);
    vi.mocked(prisma.task.update).mockResolvedValue(undefined as any);
    vi.mocked(prisma.comment.create).mockResolvedValue(undefined as any);
    vi.mocked(analyzeRejectReason).mockResolvedValue({
      symptoms: {
        expected: "automatedCheck success",
        actual: "exit 1, compilation error",
        missing_evidence: "Passing build/test output",
      },
    });
  });

  it("Успешный Headless Flow: парсит APPROVED от LLM и выставляет DONE", async () => {
    const executionReport = headlessSuccessReport();
    const llmResponse = {
      status: "APPROVED",
      reasoning:
        "All checks passed. Artifacts and automatedCheck satisfied; manualCheck deferred (headless).",
      confidence: 0.95,
    };
    vi.mocked(generateText).mockResolvedValueOnce({
      text: JSON.stringify(llmResponse),
    } as any);

    const result = await verifyTaskCompletion(taskId, executionReport);

    expect(result.status).toBe("APPROVED");
    expect(result.finalStatus).toBe("DONE");
    expect(prisma.task.update).toHaveBeenCalledWith({
      where: { id: taskId },
      data: { status: "DONE" },
    });
  });

  it("Провал автоматической проверки: парсит REJECTED и вызывает analyzeRejectReason", async () => {
    const executionReport = automatedCheckFailureReport();
    const llmResponse = {
      status: "REJECTED",
      reasoning:
        "Verification Failed. Missing evidence for: automatedCheck. Build failed with compilation errors.",
      confidence: 0.9,
    };
    vi.mocked(generateText).mockResolvedValueOnce({
      text: JSON.stringify(llmResponse),
    } as any);

    const result = await verifyTaskCompletion(taskId, executionReport);

    expect(result.status).toBe("REJECTED");
    expect(result.finalStatus).toBe("REJECTED");
    expect(prisma.task.update).toHaveBeenCalledWith({
      where: { id: taskId },
      data: { status: "REJECTED" },
    });
    expect(analyzeRejectReason).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId,
        projectId,
        qaReasoning: llmResponse.reasoning,
        verificationCriteria: mockTask.verificationCriteria,
        executorReport: executionReport,
      })
    );
  });
});
