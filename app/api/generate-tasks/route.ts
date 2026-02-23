import { NextResponse } from "next/server";
import { generateText } from "ai";
import { z } from "zod";
import { AgentRole, TaskStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getModel, getProviderApiKey, resolveProvider } from "@/lib/ai/providers";
import { trackAIUsage } from "@/lib/ai/call";
import { generateADR, saveDocToClient } from "@/lib/agents/doc-writer";
import { getCompactProjectContext } from "@/lib/agents/project-context";
import { generateTextZai } from "@/lib/ai/zai";
import { getLLMSettings } from "@/lib/settings";
import { searchGlobalInsights } from "@/lib/rag/search";
import { logInfo } from "@/lib/execution/file-logger";

const taskSchema = z.object({
  estimatedComplexity: z.enum(["S", "M", "L", "XL"]).default("M"),
  reasoning: z.string().default(""),
  tasks: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      executorAgent: z.enum(["TASK_EXECUTOR", "BACKEND", "DEVOPS"]),
      branchName: z.string().optional(),
      difficulty: z.string().optional(),
      dependencyIndices: z.array(z.number()).default([]),
      verificationCriteria: z.object({
        artifacts: z.array(z.string()).default([]),
        manualCheck: z.string().default(""),
        automatedCheck: z.string().optional(),
      }),
    })
  ).default([]),
});

export async function POST(request: Request) {
  try {
    console.log("[generate-tasks] Starting request");
    const body = await request.json().catch(() => ({}));
    const planId = typeof body?.planId === "string" ? body.planId : "";
    const providerInput = typeof body?.provider === "string" ? body.provider : undefined;
    const modelInput = typeof body?.model === "string" ? body.model : undefined;

    if (!planId) {
      console.log("[generate-tasks] Missing planId");
      return NextResponse.json({ error: "planId is required" }, { status: 400 });
    }

    console.log("[generate-tasks] Fetching plan");
    const plan = await prisma.plan.findUnique({
      where: { id: planId },
      include: { project: true },
    });

    if (!plan) {
      console.log("[generate-tasks] Plan not found:", planId);
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    const settings = await getLLMSettings();
    // Use same provider/model as for decomposition (project.aiProvider/aiModel), or body, or global settings
    const resolvedProvider = resolveProvider(
      providerInput ?? plan.project?.aiProvider ?? settings.defaultProvider
    );
    const resolvedModel =
      modelInput ??
      plan.project?.aiModel ??
      settings.defaultModel ??
      (resolvedProvider === "anthropic"
        ? "claude-3-5-sonnet-latest"
        : resolvedProvider === "zai"
          ? "glm-4.7"
          : "gpt-4o-mini");

    const apiKey = getProviderApiKey(resolvedProvider);
    if (!apiKey) {
      console.warn("[generate-tasks] missing API key", { resolvedProvider });
      return NextResponse.json(
        { error: `Missing API key for provider: ${resolvedProvider}` },
        { status: 500 }
      );
    }

    console.log("[generate-tasks] Checking existing tasks for planId:", planId);
    const existingTasks = await prisma.task.findMany({
      where: { planId },
      orderBy: { createdAt: "asc" },
    });

    if (existingTasks.length > 0) {
      console.log("[generate-tasks] Found existing tasks:", existingTasks.length);
      return NextResponse.json({ success: true, tasks: existingTasks });
    }

    console.log("[generate-tasks] Getting project context");
    const projectStateContext = await getCompactProjectContext(plan.projectId);
    console.log("[generate-tasks] Project context length:", projectStateContext.length);

    const insightsQuery = `${plan.title} ${plan.techStack ?? ""}`.trim();
    const globalInsights = await searchGlobalInsights(insightsQuery, 5);

    const prompt = `Ты — опытный Technical Team Lead. Твоя задача — декомпозировать план разработки проекта на конкретные технические задачи для MVP.

${projectStateContext}

План: ${plan.title}
Стек: ${plan.techStack}
Описание: ${plan.description ?? ""}

ШАГ 1: ОЦЕНКА СЛОЖНОСТИ
Сначала оцени сложность проекта по шкале:
- S (Small): Простой скрипт, виджет, лендинг. → 2-4 задачи
- M (Medium): MVP сервиса, бот с базой данных. → 5-8 задач
- L (Large): Сложная система, микросервисы. → 8-15 задач
- XL (Extra Large): Очень сложная система. → 15+ задач

В поле reasoning объясни, почему ты выбрал именно этот уровень сложности.

ШАГ 2: ДЕКОМПОЗИЦИЯ С GOAL-BACKWARD VERIFICATION
Исходя из оценки сложности, создай соответствующее количество задач. НЕ создавай лишних задач для простых проектов. Лучше одна большая задача "Реализовать Core Logic", чем 5 мелких "Создать файл", "Написать функцию".

ВАЖНО: Используй методологию Goal-Backward Verification. Перед тем как создать задачу, подумай: как QA-агент сможет доказать её выполнение, не имея глаз?

Для каждой задачи:
1. Укажи исполнителя (TASK_EXECUTOR, BACKEND или DEVOPS).
2. Сгенерируй короткое имя ветки branchName в формате feat/короткое-описание или fix/короткое-описание (например, feat/setup-nextjs, fix/auth-redirect). Имена веток должны быть в lowercase, с дефисами вместо пробелов, без спецсимволов.
3. ДОБАВЬ verificationCriteria с тремя полями:
   - artifacts: МАССИВ путей к файлам, которые должны быть созданы или изменены (например, ["src/app/api/auth/route.ts", "src/components/Login.tsx"]).
   - manualCheck: Описание ручной проверки, которую может выполнить человек (например, "Open localhost:3000, click Login button, see redirect to dashboard").
   - automatedCheck: Команда для автоматизированной проверки, если применимо (например, "npm run test:api", "npm run build"). Обязательна, если есть тесты.

ШАГ 3: ГРАФ ЗАВИСИМОСТЕЙ (ОБЯЗАТЕЛЬНО!)
Ты создаёшь Граф Зависимостей. Для каждой задачи укажи dependencyIndices — это индексы задач (начиная с 0), которые БЛОКИРУЮТ текущую задачу. Это массив целых чисел. Например: [0, 2] означает, что текущую задачу нельзя начать, пока не завершены задачи с индексами 0 и 2. Логика должна быть строгой: нельзя делать Фронтенд, пока не готов Бэкенд (если они связаны). Пример: Если задача 0 — 'Настройка БД', а задача 1 — 'API Аутентификации', то у задачи 1 в dependencyIndices должно быть [0]. Задачи без зависимостей имеют пустой массив dependencyIndices: []. Циклические зависимости запрещены. Зависимости должны быть логичны: API зависит от БД, Фронтенд зависит от API и т.д.`;

    console.log("[generate-tasks] Calling AI model:", resolvedProvider, resolvedModel);

    let systemPrompt = "CRITICAL RULE FOR PROJECT INITIALIZATION: When generating commands to initialize projects (e.g., create-react-app, create-vite, npx create-next-app), you MUST instruct the agent to scaffold the project in the CURRENT ROOT DIRECTORY (.) and NEVER in a subdirectory. Example: npx create-vite . --template vue-ts or npx create-next-app@latest .\n\nТы строгий системный архитектор. Сначала оцени сложность проекта (S, M, L, XL). Исходя из этого, определи оптимальное количество задач. НЕ создавай лишних задач для простых проектов. Лучше одна большая задача 'Реализовать Core Logic', чем 5 мелких 'Создать файл', 'Написать функцию'. Составь задачи техническим языком. ВАЖНО: Используй методологию Goal-Backward Verification. Перед созданием каждой задачи думай: как QA-агент докажет выполнение без глаз? Для каждой задачи укажи verificationCriteria: artifacts (пути к файлам), manualCheck (как проверить руками), automatedCheck (команда теста). ВАЖНО: Ты создаёшь Граф Зависимостей. Для каждой задачи укажи dependencyIndices — это индексы задач (начиная с 0), которые БЛОКИРУЮТ текущую задачу. Это массив целых чисел. Например: [0, 2] означает, что текущую задачу нельзя начать, пока не завершены задачи с индексами 0 и 2. Логика должна быть строгой: нельзя делать Фронтенд, пока не готов Бэкенд (если они связаны). Пример: Если задача 0 — 'Настройка БД', а задача 1 — 'API Аутентификации', то у задачи 1 в dependencyIndices должно быть [0]. Задачи без зависимостей имеют пустой массив dependencyIndices: []. Циклические зависимости запрещены. Зависимости должны быть логичны: API зависит от БД, Фронтенд зависит от API и т.д.\n\nВАЖНО: Отвечай ТОЛЬКО валидным JSON в следующем формате (без markdown кодов):\n{\n  \"estimatedComplexity\": \"S|M|L|XL\",\n  \"reasoning\": \"почему выбрана именно эта сложность\",\n  \"tasks\": [\n    {\n      \"title\": \"заголовок задачи\",\n      \"description\": \"описание задачи\",\n      \"executorAgent\": \"TASK_EXECUTOR|BACKEND|DEVOPS\",\n      \"branchName\": \"feat/описание\",\n      \"verificationCriteria\": {\n        \"artifacts\": [\"пути/к/файлам\"],\n        \"manualCheck\": \"как проверить\",\n        \"automatedCheck\": \"команда\"\n      },\n      \"dependencyIndices\": [0, 1]\n    }\n  ]\n}";

    if (globalInsights.length > 0) {
      const lessonsBlock = globalInsights
        .map((i) => `- [${i.category ?? "N/A"}] ${i.title ?? "N/A"}: ${i.recommendation ?? ""}`)
        .join("\n");
      systemPrompt += `\n\n### CRITICAL LESSONS LEARNED FROM PAST PROJECTS:\n${lessonsBlock}\nAlways apply these recommendations to avoid repeating past mistakes.`;
      logInfo("[RAG] Injected " + globalInsights.length + " insights into Architect prompt");
    }

    const finalPrompt = `${prompt}\n\nОтвечай ТОЛЬКО валидным JSON (без markdown кодов).`;

    let aiResult: any = null;
    let resultText: string;

    if (resolvedProvider === "zai") {
      resultText = await generateTextZai({
        systemPrompt,
        userMessage: finalPrompt,
        model: resolvedModel,
        temperature: settings.temperature,
        maxTokens: settings.maxTokens,
      });
    } else {
      aiResult = await generateText({
        model: getModel(resolvedProvider, resolvedModel),
        system: systemPrompt,
        prompt: finalPrompt,
        temperature: settings.temperature,
        maxTokens: settings.maxTokens,
      });
      resultText = aiResult.text ?? "";
    }

    console.log("[generate-tasks] AI response received, length:", resultText.length);

    if (aiResult) {
      await trackAIUsage(aiResult, { projectId: plan.projectId, actionType: "generate_tasks", model: resolvedModel });
    }

    let parsed;
    try {
      const cleanJson = resultText
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();
      parsed = JSON.parse(cleanJson);
    } catch (error) {
      console.error("[generate-tasks] Failed to parse JSON:", error);
      console.error("[generate-tasks] Raw response:", resultText.slice(0, 500));
      return NextResponse.json(
        {
          error: "Не удалось разобрать ответ модели",
          details: "Модель не вернула валидный JSON"
        },
        { status: 500 }
      );
    }

    const validated = taskSchema.parse(parsed);
    const { estimatedComplexity, reasoning, tasks } = validated;
    console.log("[generate-tasks] Generated", tasks.length, "tasks, complexity:", estimatedComplexity);

    console.log("[generate-tasks] Updating plan with complexity");
    await prisma.plan.update({
      where: { id: planId },
      data: {
        estimatedComplexity,
        reasoning,
      },
    });

    console.log("[generate-tasks] Starting transaction to create tasks");
    let taskRecords;
    try {
      taskRecords = await prisma.$transaction(async (tx) => {
        console.log("[generate-tasks] Creating", tasks.length, "task records");
        const records = await Promise.all(
          tasks.map((task) =>
            tx.task.create({
              data: {
                planId: plan.id,
                title: task.title,
                description: task.description,
                executorAgent: task.executorAgent as AgentRole,
                status: TaskStatus.TODO,
                observerAgent: AgentRole.TEAMLEAD,
                branchName: typeof task.branchName === "string" && task.branchName.trim() ? task.branchName.trim() : null,
              },
            }) as any
          )
        );

        const taskIds = records.map(t => t.id);
        console.log("[generate-tasks] Task IDs created:", taskIds);

        console.log("[generate-tasks] Updating tasks with dependencies");
        const updatePromises: Promise<any>[] = [];
        const dependencyPromises: Promise<any>[] = [];

        tasks.forEach((task, index) => {
          const dependencyIndices = task.dependencyIndices ?? [];
          const data: any = {};

          if (task.verificationCriteria) {
            data.verificationCriteria = task.verificationCriteria;
          }

          if (Object.keys(data).length > 0) {
            updatePromises.push(
              tx.task.update({
                where: { id: taskIds[index] },
                data,
              })
            );
          }

          if (dependencyIndices.length > 0) {
            const validDependencyIndices = dependencyIndices
              .filter(depIndex => depIndex >= 0 && depIndex < taskIds.length);
            
            console.log(`[generate-tasks] Task ${index} depends on indices:`, validDependencyIndices);
            
            validDependencyIndices.forEach(depIndex => {
              dependencyPromises.push(
                tx.taskDependency.create({
                  data: {
                    taskId: taskIds[index],
                    dependsOnId: taskIds[depIndex],
                  },
                })
              );
            });
          }
        });

        await Promise.all(updatePromises);
        await Promise.all(dependencyPromises);
        console.log("[generate-tasks] Dependencies created:", dependencyPromises.length);

        return records;
      });
      console.log("[generate-tasks] Transaction completed successfully");
    } catch (transactionError) {
      console.error("[generate-tasks] Transaction failed:", transactionError);
      if (transactionError instanceof Error) {
        console.error("[generate-tasks] Error name:", transactionError.name);
        console.error("[generate-tasks] Error message:", transactionError.message);
        console.error("[generate-tasks] Error stack:", transactionError.stack);
      }
      throw transactionError;
    }

    console.log("[generate-tasks] Fetching tasks with dependencies");
    const tasksWithDependencies = await Promise.all(
      taskRecords.map(async (task) => {
        const taskWithDeps = await prisma.task.findUnique({
          where: { id: task.id },
          include: {
            dependencies: {
              include: {
                dependsOn: {
                  select: { id: true, title: true, status: true },
                },
              },
            },
          },
        });
        return taskWithDeps;
      })
    );

    console.log("[generate-tasks] Generating ADR");
    try {
      const adrContent = await generateADR(plan.projectId, plan.id);
      await saveDocToClient(plan.projectId, "001-initial-architecture.md", adrContent);
      console.log("[generate-tasks] ADR generated successfully");
    } catch (error) {
      console.error("[generate-tasks] Failed to generate ADR:", error);
    }

    console.log("[generate-tasks] Request completed successfully");
    return NextResponse.json({ success: true, tasks: tasksWithDependencies, estimatedComplexity, reasoning });
  } catch (error) {
    console.error("[generate-tasks] Unhandled error:", error);
    if (error instanceof Error) {
      console.error("[generate-tasks] Error name:", error.name);
      console.error("[generate-tasks] Error message:", error.message);
      console.error("[generate-tasks] Error stack:", error.stack);
    } else {
      console.error("[generate-tasks] Error is not an Error instance:", error);
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate tasks" },
      { status: 500 }
    );
  }
}
