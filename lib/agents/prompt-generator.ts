import { generateText } from "ai";
import { prisma } from "@/lib/prisma";
import { getModel, getProviderApiKey, resolveProvider } from "@/lib/ai/providers";
import { trackAIUsage } from "@/lib/ai/call";
import { generateTextZai } from "@/lib/ai/zai";
import { getCompactProjectContext } from "@/lib/agents/project-context";

export async function generateTaskPrompt(
  taskId: string,
  forceRegenerate: boolean = false,
  skipSave: boolean = false,
  extraRequirement?: string
): Promise<string> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      dependencies: {
        include: {
          dependsOn: {
            select: { id: true, title: true, status: true },
          },
        },
      },
      plan: {
        include: {
          project: { include: { files: true } },
        },
      },
      attachments: true,
    },
  });

  if (!task || !task.plan?.project) {
    throw new Error("Task not found");
  }

  // Return cached prompt unless forceRegenerate is true
  if (task.generatedPrompt && !forceRegenerate) {
    return task.generatedPrompt;
  }

  const project = task.plan.project;
  const plan = task.plan;

  const projectContext = await getCompactProjectContext(project.id);

  const globalContext = project.context?.trim() ?? "";
  const contextInstruction = globalContext
    ? `Учитывай глобальный контекст проекта при генерации ответа: ${globalContext}\n\n`
    : "";

  const system =
    "Ты — Tech Lead. Твоя цель — написать идеальный промпт для разработчика (или для Cursor AI), чтобы он выполнил эту конкретную задачу.\n\n" +
    "### DYNAMIC CONTEXT AWARENESS\n" +
    "You are generating coding instructions for the CURRENT task.\n" +
    "Look at the **Project State** provided below and ADAPT your instructions accordingly:\n" +
    "1. **Check Completed Tasks**: What was just built? Does this task depend on it?\n" +
    "2. **Check Key Decisions (ADR)**: Did tech stack change? New libraries added?\n" +
    "3. **ADAPT Instructions**:\n" +
    "   - If Task 1 created `auth.ts` using Clerk, and Task 2 is \"Login Page\", explicitly tell developer to import from `auth.ts`, even if original plan didn't mention Clerk.\n" +
    "   - If a recent task switched to Tailwind CSS, make sure UI tasks use Tailwind classes.\n" +
    "   - If a task added TypeScript types, reference those types instead of `any`.\n" +
    "   - ALWAYS check the project state first, then generate context-aware instructions.\n\n" +
    (contextInstruction ? contextInstruction : "") +
    "Включи в промпт:\n" +
    "- Контекст проекта.\n" +
    `- Технический стек (${plan.techStack}).\n` +
    "- Четкие шаги реализации (Step-by-step).\n" +
    "- Какие файлы создать или изменить.\n" +
    "- Примерный код или структуру.";

  const deps = task.dependencies ?? [];
  const incompleteDeps = deps.filter((d) => d.dependsOn.status !== "DONE");
  const doneDeps = deps.filter((d) => d.dependsOn.status === "DONE");
  const dependencyWarnings =
    incompleteDeps.length > 0
      ? "\n\nВНИМАНИЕ — зависимости:\n" +
        incompleteDeps
          .map(
            (d) =>
              `Эта задача зависит от выполнения задачи «${d.dependsOn.title}». Убедись, что код совместим с результатами той задачи.`
          )
          .join("\n")
      : "";
  const dependencyContext =
    doneDeps.length > 0
      ? "\n\nУчитывай результаты уже выполненных задач: " +
        doneDeps.map((d) => `«${d.dependsOn.title}»`).join(", ")
      : "";

  const visionContexts = task.attachments
    .filter((a) => a.visionAnalysis && a.visionAnalysis.trim().length > 0)
    .map(
      (a) =>
        `=== DESIGN IMAGE: ${a.fileName} ===\n` +
        `Image URL: ${a.filePath}\n\n` +
        `AI Vision Analysis:\n${a.visionAnalysis}\n`
    )
    .join("\n");

  const visionInstruction =
    visionContexts.length > 0
      ? `\n\n=== DESIGN CONTEXT FROM IMAGES ===\n` +
        visionContexts +
        `\nIMPORTANT: The AI Vision Analysis above describes the design. Use these details to implement the UI/layout correctly.`
      : "";

  let prompt = `=== PROJECT STATE ===\n${projectContext}\n\n` +
    `=== CURRENT TASK ===\n` +
    `Задача: ${task.title}\n` +
    `Описание задачи: ${task.description}\n` +
    `Роль исполнителя: ${task.executorAgent ?? "TEAMLEAD"}\n\n` +
    dependencyWarnings +
    dependencyContext +
    visionInstruction +
    `\n\n=== INSTRUCTIONS ===\n` +
    `Generate detailed coding instructions for the task above.\n` +
    `IMPORTANT: Consider the Project State above and adapt instructions based on:\n` +
    `1. What was already built in completed tasks\n` +
    `2. Any tech stack changes or additions from ADRs\n` +
    `3. Dependencies on previous tasks\n` +
    `4. Design details from Vision Analysis (if provided above)`;

  if (extraRequirement && extraRequirement.trim()) {
    prompt +=
      `\n\n=== NEW REQUIREMENT (TICKET) ===\n` +
      `${extraRequirement.trim()}\n\n` +
      `Regenerate or adapt the instructions for this task so that this new requirement is fully satisfied, while preserving the original intent of the task.`;
  }

  const resolvedProvider = resolveProvider(
    project.aiProvider ?? process.env.AI_PROVIDER
  );
  const resolvedModel =
    project.aiModel ??
    process.env.AI_MODEL ??
    (resolvedProvider === "anthropic"
      ? "claude-3-5-sonnet-latest"
      : resolvedProvider === "zai"
        ? "glm-4.7"
        : "gpt-4o-mini");

  const apiKey = getProviderApiKey(resolvedProvider);
  if (!apiKey) {
    throw new Error(`Missing API key for provider: ${resolvedProvider}`);
  }

  let aiResult: any = null;
  let resultText: string;

  if (resolvedProvider === "zai") {
    resultText = await generateTextZai({
      systemPrompt: system,
      userMessage: prompt,
      model: resolvedModel,
      temperature: 0.3,
      maxTokens: 8000,
    });
  } else {
    aiResult = await generateText({
      model: getModel(resolvedProvider, resolvedModel),
      system,
      prompt,
      temperature: 0.3,
      maxTokens: 8000,
    });
    resultText = aiResult.text ?? "";
  }

  if (aiResult) {
    await trackAIUsage(aiResult, { projectId: project.id, taskId: task.id, actionType: "prompt_gen", model: resolvedModel });
  }

  const generatedPrompt = resultText.trim();

  if (!skipSave) {
    await prisma.task.update({
      where: { id: task.id },
      data: { generatedPrompt },
    });
  }

  return generatedPrompt;
}
