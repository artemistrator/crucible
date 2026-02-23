import { NextResponse } from "next/server";
import { generateText } from "ai";
import { existsSync } from "fs";
import { mkdir, cp } from "fs/promises";

import { prisma } from "@/lib/prisma";
import { getModel, getProviderApiKey, resolveProvider } from "@/lib/ai/providers";
import { parsePlansFromJson, PlanPayload } from "@/lib/ai/parse";
import { generateTextZai } from "@/lib/ai/zai";
import { searchGlobalInsights } from "@/lib/rag/search";
import { trackAIUsage } from "@/lib/ai/call";
import { initProjectWorkspace } from "@/lib/project/init-workspace";
import { getCompactProjectContext } from "@/lib/agents/project-context";
import { getProjectDir } from "@/lib/project-workspace";
import { getLLMSettings } from "@/lib/settings";
import { logInfo } from "@/lib/execution/file-logger";

export const maxDuration = 60;

/** Format LLM-era estimate: manual days ÷ 4 and ÷ 3 give a range (we show it as ~X–Y дней). */
function formatEstimatedTimeWithLLM(manualDays: number): string {
  const minDays = Math.max(1, Math.ceil(manualDays / 4));
  const maxDays = Math.max(1, Math.ceil(manualDays / 3));
  const dayWord = (n: number) =>
    n === 1 ? "день" : n >= 2 && n <= 4 ? "дня" : "дней";
  if (minDays === maxDays) return `~${minDays} ${dayWord(minDays)}`;
  return `~${minDays}–${maxDays} ${dayWord(maxDays)}`;
}

const SYSTEM_PROMPT_BASE = `Ты — Универсальный ИИ-Архитектор. Твоя цель: подобрать оптимальный технологический путь, исходя из реального масштаба идеи пользователя.

ПРАВИЛА ОЦЕНКИ:
1. Если идея — простая утилита (например, "конвертер PDF"): предлагай библиотеки и монолит. НИКАКИХ микросервисов и Kubernetes.
2. Если идея — SaaS с пользователями: предлагай надежный Fullstack (Next.js/Supabase).
3. Если идея — сложная система: предлагай распределенную архитектуру.

ТВОИ ТРИ ВАРИАНТА (всегда на русском):
- "Вариант 1: Прямой путь (Keep It Simple)": Минимум зависимостей, использование встроенных библиотек языка. Максимальная скорость разработки.
- "Вариант 2: Сбалансированный (Standard)": Оптимальный выбор для роста. Типизация, база данных, облачный деплой.
- "Вариант 3: Инновационный (AI-Driven/Modern)": Использование AI-агентов или новейших фреймворков для получения конкурентного преимущества.

СТРУКТУРА ОТВЕТА (JSON):
- "complexity_analysis": Твоя оценка сложности идеи (от 1 до 10) и краткое обоснование.
- "plans": Массив из 3 объектов:
    - "title": Название подхода.
    - "description": Обоснование выбора (2–4 предложения).
    - "techStack": Конкретный список технологий (строка или массив строк).
    - "relevanceScore": Оценка релевантности от 0 до 100 (целое число).
    - "estimatedComplexity": Сложность ЭТОГО плана по шкале от 1 до 5 (1 — очень просто, 5 — очень сложно).
    - "estimatedManualDays": Ориентировочное время реализации вручную, в днях (число). Система пересчитает его для разработки с LLM (деление на 3–4).
    - "pros": Массив из 2–4 коротких плюсов (строки).
    - "cons": Массив из 1–2 минусов или рисков (строки).
    - "anti_overengineering_check": Почему этот стек НЕ избыточен для задачи (кратко).

ВАЖНО: Отвечай только валидным JSON. Будь прагматичен. Если задачу можно решить одним скриптом — так и пиши.`;

const SYSTEM_PROMPT_EVOLVE = `Ты — ИИ-Архитектор, который МОДИФИЦИРУЕТ существующий проект.

КОНТЕКСТ:
Пользователь хочет доработать уже существующий проект. Твоя задача — понять текущий стек, проанализировать существующий код и предложить планы для НОВОЙ функциональности, которые гармонично впишутся в существующую архитектуру.

НИЖЕ ПРИВЕДЕН КОНТЕКСТ СУЩЕСТВУЮЩЕГО ПРОЕКТА:
{PROJECT_CONTEXT_PLACEHOLDER}

ПРАВИЛА:
1. АНАЛИЗ: Изучи текущий стек проекта, выполненные задачи и архитектурные решения из контекста.
2. СОВМЕСТИМОСТЬ: Предлагай только те технологии, которые совместимы с текущим стеком.
   - Если текущий стек: React/Next.js → не предлагай Vue/Angular
   - Если текущий стек: Python → не предлагай Node.js без веских причин
   - Если текущий стек: PostgreSQL → не предлагай MongoDB без веских причин
3. ПОСЛЕДОВАТЕЛЬНОСТЬ: Твои планы должны быть ориентированы на дополнение, а не замену существующего кода.
4. РАЗУМНОСТЬ: НЕ генерируй задачи для того, что УЖЕ СДЕЛАНО (см. Completed Tasks). Генерируй только задачи для НОВОЙ функциональности.

ТВОИ ТРИ ВАРИАНТА (всегда на русском):
- "Вариант 1: Минимальные изменения": Используй существующие библиотеки и паттерны. Минимальный риск для стабильности.
- "Вариант 2: Сбалансированный подход": Добавь новые библиотеки для улучшения, но сохрани существующую структуру.
- "Вариант 3: Глубокая интеграция": Предлагай масштабные изменения для улучшения архитектуры (если это оправдано).

СТРУКТУРА ОТВЕТА (JSON):
- "complexity_analysis": Твоя оценка сложности добавления новой функциональности (от 1 до 10).
- "plans": Массив из 3 объектов:
    - "title": Название подхода.
    - "description": Обоснование выбора и как это впишется в текущую архитектуру (2–4 предложения).
    - "techStack": Конкретный список технологий (учитывая текущий стек).
    - "relevanceScore": Оценка релевантности от 0 до 100 (целое число).
    - "estimatedComplexity": Сложность ЭТОГО плана по шкале от 1 до 5 (1 — очень просто, 5 — очень сложно).
    - "estimatedManualDays": Ориентировочное время реализации вручную, в днях (число). Система пересчитает для разработки с LLM.
    - "pros": Массив из 2–4 коротких плюсов (строки).
    - "cons": Массив из 1–2 минусов или рисков (строки).
    - "anti_overengineering_check": Почему этот подход НЕ избыточен для задачи.

ВАЖНО: Отвечай только валидным JSON. Будь прагматичен. Цель — добавить функциональность, а не переписать проект.`;

async function buildSystemPrompt(ideaText: string, baseProjectId: string | null): Promise<string> {
  const globalInsights = await searchGlobalInsights(ideaText, 5);

  let basePrompt = baseProjectId ? SYSTEM_PROMPT_EVOLVE : SYSTEM_PROMPT_BASE;

  // If evolve mode, get project context and insert into prompt
  if (baseProjectId) {
    try {
      const projectContext = await getCompactProjectContext(baseProjectId);
      basePrompt = basePrompt.replace("{PROJECT_CONTEXT_PLACEHOLDER}", projectContext);
      console.info("[decompose-idea] project context loaded", {
        baseProjectId,
        contextLength: projectContext.length
      });
    } catch (error) {
      console.error("[decompose-idea] failed to load project context:", error);
      // Fallback: remove placeholder
      basePrompt = basePrompt.replace("{PROJECT_CONTEXT_PLACEHOLDER}", "Не удалось загрузить контекст проекта. Работай в режиме ограниченной информации.");
    }
  }

  if (globalInsights.length === 0) {
    return basePrompt;
  }

  const lessonsBlock = globalInsights
    .map((i) => `- [${i.category ?? "N/A"}] ${i.title ?? "N/A"}: ${i.recommendation ?? ""}`)
    .join("\n");

  logInfo("[RAG] Injected " + globalInsights.length + " insights into Architect prompt");

  return `${basePrompt}

### CRITICAL LESSONS LEARNED FROM PAST PROJECTS:
${lessonsBlock}
Always apply these recommendations to avoid repeating past mistakes.`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { ideaText, provider, model, baseProjectId } = body ?? {};

    console.info("[decompose-idea] request received", {
      hasIdeaText: typeof ideaText === "string" && ideaText.trim().length > 0,
      provider,
      model,
      baseProjectId,
      isEvolveMode: !!baseProjectId
    });

    if (!ideaText || typeof ideaText !== "string") {
      return NextResponse.json({ error: "ideaText is required" }, { status: 400 });
    }

    const systemPrompt = await buildSystemPrompt(ideaText, baseProjectId || null);

    // If evolve mode, verify base project exists
    let baseProject = null;
    if (baseProjectId) {
      baseProject = await prisma.project.findUnique({
        where: { id: baseProjectId }
      });
      if (!baseProject) {
        return NextResponse.json({ error: "Base project not found" }, { status: 404 });
      }
      console.info("[decompose-idea] evolve mode", {
        baseProjectId,
        baseProjectIdea: baseProject.ideaText.slice(0, 100)
      });
    }

    const settings = await getLLMSettings();
    const resolvedProvider = resolveProvider(provider || settings.defaultProvider);
    const resolvedModel =
      typeof model === "string"
        ? model
        : settings.defaultModel ||
          (resolvedProvider === "anthropic"
            ? "claude-3-5-sonnet-latest"
            : resolvedProvider === "zai"
              ? "glm-4.7"
              : "gpt-4.1-mini");

    const apiKey = getProviderApiKey(resolvedProvider);
    if (!apiKey) {
      console.warn("[decompose-idea] missing API key", { resolvedProvider });
      return NextResponse.json(
        { error: `Missing API key for provider: ${resolvedProvider}` },
        { status: 500 }
      );
    }

    console.info("[decompose-idea] calling model", {
      resolvedProvider,
      resolvedModel,
      hasGlobalInsights: systemPrompt !== SYSTEM_PROMPT_BASE
    });

    const maxTokens = settings.maxTokens;
    const maxRetries = 3;
    let plans: PlanPayload[];
    let aiResult: any = null;
    let lastError: Error | null = null;
    let lastRawText = "";

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      console.info(`[decompose-idea] attempt ${attempt}/${maxRetries}`);
      
      let resultText: string;
      
      try {
        if (resolvedProvider === "zai") {
          resultText = await generateTextZai({
            systemPrompt,
            userMessage: `Project Idea: ${ideaText}`,
            model: resolvedModel,
            temperature: settings.temperature,
            maxTokens,
          });
        } else {
          const modelInstance = getModel(resolvedProvider, resolvedModel);
          aiResult = await generateText({
            model: modelInstance,
            system: systemPrompt,
            prompt: `Project Idea: ${ideaText}`,
            temperature: settings.temperature,
            maxTokens,
          });
          resultText = aiResult.text ?? "";
        }

        if (!resultText?.trim()) {
          console.warn(`[decompose-idea] attempt ${attempt}: empty LLM response`);
          if (attempt === maxRetries) {
            return NextResponse.json(
              { error: "Модель вернула пустой ответ.", code: "EMPTY_RESPONSE" },
              { status: 502 }
            );
          }
          continue;
        }

        lastRawText = resultText;
        plans = parsePlansFromJson(resultText);
        
        // Success!
        console.info(`[decompose-idea] successfully parsed plans on attempt ${attempt}`, {
          planCount: plans.length
        });
        break;
        
      } catch (error) {
        const msg = error instanceof Error ? error.message : "unknown";
        lastError = error instanceof Error ? error : new Error(String(error));
        
        console.warn(`[decompose-idea] attempt ${attempt} failed:`, {
          message: msg,
          rawPreview: lastRawText.slice(0, 400)
        });
        
        if (attempt === maxRetries) {
          console.error("[decompose-idea] all retry attempts exhausted", {
            message: msg,
            rawLength: lastRawText.length,
            rawPreview: lastRawText.slice(0, 800),
            rawFull: lastRawText
          });
          
          return NextResponse.json(
            {
              error: `Не удалось разобрать ответ модели после ${maxRetries} попыток: ${msg}. Ожидался JSON с 1-3 планами.`,
              code: "PARSE_ERROR",
              rawPreview: lastRawText.slice(0, 800)
            },
            { status: 422 }
          );
        }
        
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      let project;

      if (baseProjectId) {
        // Evolve mode: create a COPY of the existing project (Copy-on-Evolve)
        project = await tx.project.create({
          data: {
            ideaText, // New idea text for the evolution
            context: baseProject?.context || "",
            userId: baseProject?.userId,
            aiProvider: baseProject?.aiProvider || resolvedProvider,
            aiModel: baseProject?.aiModel || resolvedModel,
            requireApproval: baseProject?.requireApproval || false,
          },
        });
        console.info("[decompose-idea] evolve mode: created copy of project", {
          baseProjectId,
          newProjectId: project.id,
        });
      } else {
        // Create new project
        project = await tx.project.create({
          data: {
            ideaText,
            aiProvider: resolvedProvider,
            aiModel: resolvedModel,
          },
        });
        console.info("[decompose-idea] new project created", { projectId: project.id });
      }

      const planRecords = await Promise.all(
        plans.map((plan) => {
          const estimatedTime =
            plan.estimatedManualDays != null && plan.estimatedManualDays > 0
              ? formatEstimatedTimeWithLLM(plan.estimatedManualDays)
              : null;
          const prosCons =
            plan.pros?.length || plan.cons?.length
              ? { pros: plan.pros ?? [], cons: plan.cons ?? [] }
              : null;
          return tx.plan.create({
            data: {
              projectId: project.id,
              title: plan.title,
              description: plan.description,
              techStack: plan.techStack,
              relevanceScore: plan.relevanceScore,
              estimatedComplexity:
                plan.estimatedComplexity != null
                  ? String(plan.estimatedComplexity)
                  : null,
              estimatedTime,
              reasoning: plan.reasoning ?? null,
              prosCons: prosCons ?? undefined
            }
          });
        })
      );

      return { project, plans: planRecords };
    });

    // Immediately prepare on-disk workspace so kit files and sync can work
    // right after plans are generated.
    try {
      await initProjectWorkspace(created.project.id);

      // If evolve mode, copy files from base project to new project
      if (baseProjectId) {
        const baseProjectDir = getProjectDir(baseProjectId);
        const newProjectDir = getProjectDir(created.project.id);

        console.info("[decompose-idea] copying files for evolve mode", {
          baseProjectDir,
          newProjectDir,
        });

        if (existsSync(baseProjectDir)) {
          await cp(baseProjectDir, newProjectDir, { recursive: true });
          console.info("[decompose-idea] files copied successfully", {
            from: baseProjectDir,
            to: newProjectDir,
          });
        } else {
          console.warn("[decompose-idea] base project directory not found, skipping copy", {
            baseProjectDir,
          });
        }
      }
    } catch (e) {
      console.error("[decompose-idea] Failed to init project workspace or copy files:", e);
    }

    if (aiResult) {
      await trackAIUsage(aiResult, { projectId: created.project.id, actionType: "decompose", model: resolvedModel });
    }

    return NextResponse.json({
      projectId: created.project.id,
      plans: created.plans
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : error != null ? String(error) : "Failed to decompose idea";
    console.error("[decompose-idea] unhandled error", { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
