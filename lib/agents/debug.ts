import { generateText } from "ai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getModel, resolveProvider } from "@/lib/ai/providers";
import { trackAIUsage } from "@/lib/ai/call";

const debugSummarySchema = z.object({
  symptoms: z.object({
    expected: z.string(),
    actual: z.string(),
    missing_evidence: z.string(),
  }),
});

export interface DebugSummary {
  symptoms: {
    expected: string;
    actual: string;
    missing_evidence: string;
  };
}

export async function analyzeRejectReason(params: {
  projectId: string;
  taskId: string;
  qaReasoning: string;
  verificationCriteria: {
    artifacts?: string[];
    manualCheck?: string;
    automatedCheck?: string;
  } | null;
  executorReport: string;
}): Promise<DebugSummary> {
  const { projectId, taskId, qaReasoning, verificationCriteria, executorReport } = params;

  const prompt = `You are a Debug Specialist analyzing a QA rejection following the GSD methodology.

=== CONTEXT ===
QA Agent REJECTED the task and provided this reasoning:
"${qaReasoning}"

=== VERIFICATION CRITERIA (what was required) ===
${verificationCriteria ? `${verificationCriteria.artifacts && verificationCriteria.artifacts.length > 0 ? `[Artifacts]\n${verificationCriteria.artifacts.map(a => `  - ${a}`).join('\n')}\n` : ''}${verificationCriteria.manualCheck ? `[manualCheck]\n${verificationCriteria.manualCheck}\n` : ''}${verificationCriteria.automatedCheck ? `[automatedCheck]\n${verificationCriteria.automatedCheck}\n` : ''}` : 'No verification criteria provided'}

=== EXECUTOR REPORT (what was submitted) ===
${executorReport}

=== YOUR MISSION ===
Analyze the rejection and generate a Debug Summary in GSD format.

Fill in these three fields:

1. **expected**: What the QA Agent required based on verificationCriteria
   - List the required artifacts
   - List the required automated checks (tests/builds)
   - List the required manual verification steps

2. **actual**: What the Executor actually provided in their report
   - What evidence was actually shown?
   - What files were mentioned/shown?
   - What test/build outputs were provided?
   - What confirmations were given?

3. **missing_evidence**: What evidence is missing to satisfy the QA
   - Be SPECIFIC about what's missing
   - If artifacts are missing: list which files need to be shown
   - If automatedCheck failed: say what logs/output are needed
   - If manualCheck missing: specify what confirmation/screenshot is needed

OUTPUT FORMAT (EXACT):
Return ONLY valid JSON with this structure:
{
  "symptoms": {
    "expected": "concise summary of what was required",
    "actual": "concise summary of what was submitted",
    "missing_evidence": "concise list of what's missing"
  }
}

EXAMPLE:
If QA says "Verification Failed. Missing evidence for: [Artifacts] Please provide ls -la output showing src/app/api/auth/route.ts exists. [automatedCheck] Please provide npm run test output showing PASS."

Your output should be:
{
  "symptoms": {
    "expected": "Create src/app/api/auth/route.ts with authentication logic and run npm run test",
    "actual": "Report mentions authentication implementation but does not show file content or test results",
    "missing_evidence": "1. ls -la output or full content of src/app/api/auth/route.ts\n2. npm run test output showing PASS status"
  }
}`;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { aiProvider: true, aiModel: true },
  });
  const resolvedProvider = resolveProvider(project?.aiProvider ?? undefined);
  const resolvedModel = project?.aiModel ?? "gpt-4o-mini";
  const model = getModel(resolvedProvider, resolvedModel);
  const modelDisplay = project?.aiModel ?? `${resolvedProvider}/${resolvedModel}`;

  const result = await generateText({
    model,
    system: "You are a Debug Specialist following GSD methodology. Your job is to analyze QA rejections and generate clear Debug Summaries that help developers understand exactly what evidence is missing. Be concise, specific, and actionable.",
    prompt,
    temperature: 0.2,
  });

  await trackAIUsage(result, { projectId, taskId, actionType: "debug_analysis", model: modelDisplay });

  const parsed = debugSummarySchema.safeParse(JSON.parse(result.text?.trim() || "{}"));
  if (!parsed.success) {
    console.error("[Debug] Failed to parse response:", result.text, parsed.error);
    throw new Error("Debug analysis response parsing failed");
  }

  return parsed.data;
}
