import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { generateText } from "ai";
import { generateTextZai } from "@/lib/ai/zai";
import { getLLMSettings } from "@/lib/settings";
import { getModel, resolveProvider } from "@/lib/ai/providers";
import { generateEmbedding } from "@/lib/ai/embeddings";

export const InsightSchema = z.object({
  title: z.string().min(1).max(256),
  summary: z.string().min(1),
  category: z.enum(["TOOLING", "WORKFLOW", "QA_PROCESS", "ARCHITECTURE", "DOCUMENTATION", "MISC"]),
  severity: z.enum(["low", "medium", "high"]),
  appliesTo: z.object({
    projectId: z.string(),
    planId: z.string().nullable().optional(),
    sessionId: z.string().nullable().optional(),
  }),
  recommendation: z.string().min(1),
  fingerprint: z.string().min(1).max(128).optional(),
  tags: z.array(z.string().min(1)).max(16).optional(),
});

export const InsightArraySchema = z.array(InsightSchema).max(3);

type ReflexologistMode = "final" | "incremental";

interface RunReflexologistOptions {
  projectId: string;
  sessionId: string;
  planId?: string | null;
  mode?: ReflexologistMode;
  maxInsights?: number;
}

export async function runReflexologistForSession(options: RunReflexologistOptions): Promise<void> {
  const { projectId, sessionId, planId, mode = "final", maxInsights = 3 } = options;

  try {
    const session = await prisma.executionSession.findUnique({
      where: { id: sessionId },
      include: { project: true },
    });

    if (!session || !session.project) {
      console.error("[Reflexologist] Session or project not found", { sessionId, projectId });
      return;
    }

    const project = session.project;
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const logs = await prisma.executionLog.findMany({
      where: {
        sessionId,
        createdAt: {
          gte: oneHourAgo,
        },
      },
      orderBy: { createdAt: "asc" },
      take: 150,
    });

    const planTasks = planId
      ? await prisma.task.findMany({
          where: { planId },
          select: { id: true, title: true },
        })
      : [];

    const taskIds = planTasks.map((t) => t.id);

    const comments =
      taskIds.length > 0
        ? await prisma.comment.findMany({
            where: { taskId: { in: taskIds } },
            orderBy: { createdAt: "asc" },
            take: 100,
          })
        : [];

    const metadata = (session.metadata as Record<string, any>) || {};
    const retrySummary = {
      retryCounter: metadata.retryCounter ?? {},
      lastErrorSignature: metadata.lastErrorSignature ?? null,
    };

    const logLines = logs.map((log) => {
      const eventType = (log.metadata as any)?.eventType ?? "unknown";
      const type = log.type;
      const ts = log.createdAt.toISOString();
      const msg =
        log.message.length > 400 ? log.message.slice(0, 397) + "..." : log.message;
      return `[${ts}] [${eventType}] [${type}] ${msg}`;
    });

    const qaOutcomes = logs
      .filter((log) => (log.metadata as any)?.eventType === "task_qa_completed")
      .map((log) => {
        const meta = (log.metadata as any) ?? {};
        const data = meta.data ?? {};
        return {
          taskId: data.taskId ?? null,
          status: data.status ?? null,
          message: log.message,
        };
      });

    const qaAndDevopsComments = comments.filter((c) =>
      ["QA", "DEVOPS"].includes(c.authorRole as string),
    );

    const commentsSummary = qaAndDevopsComments.map((c) => {
      const ts = c.createdAt.toISOString();
      const role = c.authorRole;
      const content =
        c.content.length > 600 ? c.content.slice(0, 597) + "..." : c.content;
      return `[${ts}] [${role}] ${content}`;
    });

    const hasSignals =
      qaOutcomes.length > 0 ||
      Object.keys(retrySummary.retryCounter || {}).length > 0 ||
      logs.some((l) => l.type === "error");

    if (!hasSignals && mode === "incremental") {
      console.log("[Reflexologist] Skipping incremental run – no strong signals");
      return;
    }

    const executionContext = {
      projectId,
      sessionId,
      planId: planId ?? session.planId ?? null,
      mode,
      logsSummary: logLines,
      qaOutcomes,
      retrySummary,
      commentsSummary,
    };

    const systemPrompt = `You are a Senior Staff Engineer analyzing development execution logs for a multi-agent AI coding system.

Your job:
- Identify NON-OBVIOUS, HIGH-LEVEL, REUSABLE INSIGHTS about the development workflow, tooling, or verification process.
- Focus on ROOT CAUSES and SYSTEMIC PATTERNS, not single failures.

Very important rules:
1) DO NOT restate obvious facts like "Task failed" or "QA rejected the task".
2) DO NOT describe individual logs or events.
3) ONLY produce insights that can improve FUTURE runs across many projects.
4) Prefer patterns that appear multiple times (e.g. repeated errors, repeated QA rejections for similar reasons).
5) If the available data is noisy or insufficient, you MUST return an empty array.

You are given structured context:
- executionLogs: recent normalized execution log lines with eventType, type, message.
- qaOutcomes: per-task QA results, including repeated rejections and reasons if available.
- retrySummary: aggregated information about repeated technical errors (grouped by error signature/message).
- commentsSummary: truncated QA and DEVOPS comments that explain what went wrong or what was missing.

Your output MUST be a pure JSON array (no markdown, no extra text) of 0 to ${maxInsights} objects.
Each object MUST have the following fields:
- "title": short human-readable name of the insight (1 line).
- "summary": 2-4 sentences explaining the pattern and the underlying root cause.
- "category": one of ["TOOLING", "WORKFLOW", "QA_PROCESS", "ARCHITECTURE", "DOCUMENTATION", "MISC"].
- "severity": one of ["low", "medium", "high"], indicating potential impact.
- "appliesTo": object with known identifiers: { "projectId": string, "planId"?: string | null, "sessionId"?: string | null }.
- "recommendation": 2-5 sentences with specific, actionable improvements (what to change and where).
- "fingerprint" (optional): stable identifier for this insight pattern, e.g. a short slug like "writeFile-missing-parent-dir" or a hash.
- "tags" (optional): array of short tags, e.g. ["writeFile", "filesystem", "missing-directories"].

If you cannot find any such reusable insights, return [] (an empty JSON array).
Return ONLY valid JSON that can be parsed by JSON.parse.`;

    const userPrompt = `Here is the structured execution context as JSON:

${JSON.stringify(executionContext, null, 2)}

Analyze this context and return an array of 0 to ${maxInsights} insights as specified.`;

    const resolvedProvider = resolveProvider(project.aiProvider || undefined);
    const resolvedModel = project.aiModel || "gpt-4o-mini";
    const llmSettings = await getLLMSettings();
    const reflexTemperature = Math.min(llmSettings.temperature, 0.1);

    let rawText: string;
    if (resolvedProvider === "zai") {
      const raw = await generateTextZai({
        systemPrompt,
        userMessage: userPrompt,
        model: resolvedModel,
        temperature: reflexTemperature,
        maxTokens: llmSettings.maxTokens,
      });
      rawText = typeof raw === "string" ? raw : JSON.stringify(raw);
    } else {
      const result = await generateText({
        model: getModel(resolvedProvider, resolvedModel),
        system: systemPrompt,
        prompt: userPrompt,
        temperature: reflexTemperature,
        maxTokens: llmSettings.maxTokens,
      });
      rawText = result.text ?? "";
    }

    if (!rawText.trim()) {
      console.log("[Reflexologist] Empty LLM response, skipping");
      return;
    }

    const cleaned = rawText.replace(/^[\s\S]*?(\[[\s\S]*\])[\s\S]*$/m, "$1").trim();

    let parsed: z.infer<typeof InsightArraySchema>;
    try {
      parsed = InsightArraySchema.parse(JSON.parse(cleaned));
    } catch (err) {
      console.error("[Reflexologist] Failed to parse insights JSON", err);
      return;
    }

    if (parsed.length === 0) {
      console.log("[Reflexologist] LLM returned no insights");
      return;
    }

    const planIdToUse = planId ?? session.planId ?? null;

    let createdCount = 0;

    for (const insight of parsed) {
      const fingerprint =
        insight.fingerprint ||
        `${insight.category}:${insight.title}`.toLowerCase().slice(0, 120);

      const existing = await prisma.globalInsight.findFirst({
        where: {
          projectId,
          fingerprint,
        },
      });

      if (existing) {
        continue;
      }

      const textToEmbed = insight.title + "\n" + insight.summary + "\n" + insight.recommendation;
      const vector = await generateEmbedding(textToEmbed);

      await prisma.globalInsight.create({
        data: {
          projectId,
          planId: planIdToUse ?? undefined,
          sessionId,
          title: insight.title,
          content: insight.summary,
          category: insight.category,
          severity: insight.severity,
          recommendation: insight.recommendation,
          fingerprint,
          tags: insight.tags ?? [],
          ...(vector != null && { embedding: JSON.stringify(vector) }),
        },
      });

      createdCount++;
    }

    await prisma.executionLog.create({
      data: {
        sessionId,
        type: "info",
        message: `[Reflexologist] Generated ${createdCount} insights (${mode} run)`,
        metadata: {
          eventType: "reflexologist_run",
          data: {
            projectId,
            sessionId,
            planId: planIdToUse,
            mode,
            count: createdCount,
          },
        },
      },
    });
  } catch (error) {
    console.error("[Reflexologist] Failed to run reflexologist", error);
    try {
      await prisma.executionLog.create({
        data: {
          sessionId: options.sessionId,
          type: "error",
          message:
            "[Reflexologist] Error while generating insights: " +
            (error instanceof Error ? error.message : String(error)),
          metadata: {
            eventType: "reflexologist_error",
          },
        },
      });
    } catch (logErr) {
      console.error("[Reflexologist] Failed to log error", logErr);
    }
  }
}

