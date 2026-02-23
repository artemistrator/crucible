import { generateObject, generateText } from "ai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getModel, resolveProvider } from "@/lib/ai/providers";
import { trackAIUsage } from "@/lib/ai/call";
import { saveDocToClient } from "@/lib/agents/doc-writer";
import { getCompactProjectContext } from "./project-context";

const replanSchema = z.object({
  needsReplan: z.boolean(),
  updates: z.array(
    z.object({
      taskId: z.string(),
      newTitle: z.string(),
      newDescription: z.string(),
      newVerificationCriteria: z.object({
        artifacts: z.array(z.string()),
        manualCheck: z.string(),
        automatedCheck: z.string().optional(),
      }).optional(),
    })
  ),
  reasoning: z.string(),
});

const quickReviewSchema = z.object({
  needsUpdates: z.boolean(),
  updates: z.array(
    z.object({
      taskId: z.string(),
      newDescription: z.string(),
    })
  ),
  reasoning: z.string(),
});

export async function replanTasks(projectId: string, completedTaskId: string) {
  const completedTask = await prisma.task.findUnique({
    where: { id: completedTaskId },
    include: {
      plan: {
        include: {
          project: true,
        },
      },
      comments: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!completedTask || !completedTask.plan?.project) {
    throw new Error("Completed task not found");
  }

  const pendingTasks = await prisma.task.findMany({
    where: {
      planId: completedTask.planId,
      status: "TODO",
      id: { not: completedTaskId },
    },
    orderBy: { createdAt: "asc" },
  });

  if (pendingTasks.length === 0) {
    return { needsReplan: false, reason: "No pending tasks" };
  }

  const lastComment = completedTask.comments[0];
  const executionReport = lastComment?.content || completedTask.generatedPrompt || "";

  const projectStateContext = await getCompactProjectContext(completedTask.plan.projectId);

  const tasksList = pendingTasks
    .map((t) => `- [ID: ${t.id}] ${t.title}\n  ${t.description}`)
    .join("\n\n");

  const prompt = `Ты — Технический Архитектор. Мы только что завершили задачу.

${projectStateContext}

Завершенная задача: ${completedTask.title}
Описание: ${completedTask.description}
Отчет о выполнении: ${executionReport}

План проекта: ${completedTask.plan.title}
Стек: ${completedTask.plan.techStack}

Оставшиеся задачи (статус TODO):
${tasksList}

Проанализируй, влияет ли завершенная задача на оставшиеся задачи.
Например:
- Выбрана другая библиотека/технология?
- Изменилась архитектура проекта?
- Некоторые задачи теперь избыточны?
- Задачи требуют уточнения?
- Требуется ли обновление verificationCriteria (артефакты, проверки)?

Если задачи устарели или требуют изменений — перепиши их названия, описания и verificationCriteria.
Если всё актуально — верни needsReplan: false.`;

  const project = completedTask.plan.project;
  const resolvedProvider = resolveProvider(project.aiProvider ?? undefined);
  const resolvedModel = project.aiModel ?? "gpt-4o-mini";
  const model = getModel(resolvedProvider, resolvedModel);
  const modelDisplay = project.aiModel ?? `${resolvedProvider}/${resolvedModel}`;

  const result = await generateObject({
    model,
    schema: replanSchema,
    system: "Ты внимательный технический архитектор. Анализируй влияние изменений на план проекта. Будь точным и избегай лишних изменений. При необходимости обновляй verificationCriteria используя методологию Goal-Backward Verification: QA должен иметь возможность доказать выполнение без глаз. У тебя есть доступ в интернет через webSearch. Если нужна свежая документация или информация — ГУГЛИ. Не гадай.",
    prompt,
    temperature: 0.2,
  });

  await trackAIUsage(result, { projectId, taskId: completedTaskId, actionType: "replan", model: modelDisplay });

  const { needsReplan, updates, reasoning } = result.object;

  if (!needsReplan || updates.length === 0) {
    return { needsReplan: false, reasoning };
  }

  const updatePromises = updates.map(async (update) => {
    const { taskId, newTitle, newDescription, newVerificationCriteria } = update;

    const task = await prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task) return null;

    await prisma.task.update({
      where: { id: taskId },
      data: {
        title: newTitle,
        description: newDescription,
        ...(newVerificationCriteria && { verificationCriteria: newVerificationCriteria }),
      },
    });

    await prisma.comment.create({
      data: {
        taskId,
        content: `Автоматически обновлено Архитектором на основе завершенной задачи "${completedTask.title}"`,
        authorRole: "TEAMLEAD",
      },
    });

    return { taskId, oldTitle: task.title, newTitle, newDescription };
  });

  const updatedTasks = (await Promise.all(updatePromises)).filter((t) => t !== null);

  try {
    const adrPrompt = `Ты — Software Architect. Мы изменили план проекта.

Завершенная задача: ${completedTask.title}
Отчет о выполнении: ${executionReport}

Обоснование изменений: ${reasoning}

Измененные задачи:
${updatedTasks.map(t => `- ${t.oldTitle} -> ${t.newTitle}`).join('\n')}

Напиши **Architecture Decision Record (ADR)** для этого изменения в формате Markdown.

Структура:
# ADR-002: Изменение архитектурного плана
## Status
Accepted
## Context
Мы завершили задачу "${completedTask.title}", что повлекло изменения в плане.
## Decision
Мы изменили задачи проекта, потому что: ${reasoning}
## Consequences
Плюсы: ...
Минусы: ...`;

    const adrProvider = resolveProvider(completedTask.plan.project.aiProvider ?? undefined);
    const adrModel = completedTask.plan.project.aiModel ?? "gpt-4o-mini";
    const adrModelInstance = getModel(adrProvider, adrModel);
    const adrModelDisplay = completedTask.plan.project.aiModel ?? `${adrProvider}/${adrModel}`;

    const adrResult = await generateText({
      model: adrModelInstance,
      system: "Ты опытный Software Architect. Пиши чёткие и структурированные ADR. У тебя есть доступ в интернет через webSearch. Если нужна свежая документация — ГУГЛИ. Не гадай.",
      prompt: adrPrompt,
      temperature: 0.3,
    });

    await trackAIUsage(adrResult, { projectId: completedTask.plan.projectId, taskId: completedTaskId, actionType: "generate-adr-replan", model: adrModelDisplay });

    const timestamp = Date.now();
    await saveDocToClient(completedTask.plan.projectId, `002-architecture-change-${timestamp}.md`, adrResult.text);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[replanTasks] Failed to generate ADR:", error);
    }
  }

  return {
    needsReplan: true,
    reasoning,
    updatedTasks,
  };
}

/**
 * Quick Review - Lightweight replan for immediate next tasks
 * Only reviews the next 2 TODO tasks instead of all pending tasks
 */
export async function quickReview(projectId: string, completedTaskId: string) {
  const completedTask = await prisma.task.findUnique({
    where: { id: completedTaskId },
    include: {
      plan: {
        include: {
          project: true,
        },
      },
      comments: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!completedTask || !completedTask.plan?.project) {
    throw new Error("Completed task not found");
  }

  // Get only the next 2 TODO tasks (lightweight)
  const nextTasks = await prisma.task.findMany({
    where: {
      planId: completedTask.planId,
      status: "TODO",
      id: { not: completedTaskId },
    },
    orderBy: { createdAt: "asc" },
    take: 2, // Only next 2 tasks
  });

  if (nextTasks.length === 0) {
    return { needsUpdates: false, reasoning: "No pending tasks" };
  }

  const lastComment = completedTask.comments[0];
  const executionReport = lastComment?.content || completedTask.generatedPrompt || "";

  const projectStateContext = await getCompactProjectContext(completedTask.plan.projectId);

  const tasksList = nextTasks
    .map((t) => `- [ID: ${t.id}] ${t.title}\n  ${t.description}`)
    .join("\n\n");

  const prompt = `Ты — Технический Архитектор. Мы только что завершили задачу.

${projectStateContext}

Завершенная задача: ${completedTask.title}
Описание: ${completedTask.description}
Отчет о выполнении: ${executionReport}

Следующие задачи (статус TODO, только 2 следующих):
${tasksList}

Проанализируй, влияет ли завершенная задача на эти задачи.
Например:
- Выбрана другая библиотека/технология? (например, перешли на Tailwind CSS)
- Изменилась архитектура проекта? (например, создали auth.ts с Clerk)
- Некоторые файлы были созданы/изменены с другими именами?
- Требуется ли обновление описания задач?

Если задачи устарели или требуют изменений — ОБНОВИ описания.
Если всё актуально — верни needsUpdates: false.

ВАЖНО: Используй цепочку рассуждений (Chain of Thought):
1. Сначала проанализируй, что было сделано в завершенной задаче
2. Затем проверь, влияет ли это на следующие задачи
3. Если влияет — предложи конкретные изменения в описании
4. Только затем обнови задачи`;

  const qrProject = completedTask.plan.project;
  const qrProvider = resolveProvider(qrProject.aiProvider ?? undefined);
  const qrModel = qrProject.aiModel ?? "gpt-4o-mini";
  const qrModelInstance = getModel(qrProvider, qrModel);
  const qrModelDisplay = qrProject.aiModel ?? `${qrProvider}/${qrModel}`;

  const result = await generateObject({
    model: qrModelInstance,
    schema: quickReviewSchema,
    system: "Ты внимательный технический архитектор. Быстро анализируй влияние завершенной задачи на следующие 2 задачи. Используй цепочку рассуждений: что сделано → что влияет → что обновить. Будь точным и избегай лишних изменений. У тебя есть доступ в интернет через webSearch. Если нужна свежая документация — ГУГЛИ. Не гадай.",
    prompt,
    temperature: 0.2,
  });

  await trackAIUsage(result, { projectId, taskId: completedTaskId, actionType: "quick-review", model: qrModelDisplay });

  const { needsUpdates, updates, reasoning } = result.object;

  if (!needsUpdates || updates.length === 0) {
    return { needsUpdates: false, reasoning };
  }

  // Update tasks with new descriptions
  const updatePromises = updates.map(async (update) => {
    const { taskId, newDescription } = update;

    const task = await prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task) return null;

    await prisma.task.update({
      where: { id: taskId },
      data: {
        description: newDescription,
      },
    });

    await prisma.comment.create({
      data: {
        taskId,
        content: `🔄 Быстрый обзор: описание обновлено на основе завершенной задачи "${completedTask.title}"\n\n${reasoning}`,
        authorRole: "TEAMLEAD",
      },
    });

    return { taskId, oldDescription: task.description, newDescription };
  });

  const updatedTasks = (await Promise.all(updatePromises)).filter((t) => t !== null);

  return {
    needsUpdates: true,
    reasoning,
    updatedTasks,
  };
}
