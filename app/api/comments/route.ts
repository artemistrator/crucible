import { NextResponse } from "next/server";
import { generateText } from "ai";

import { prisma } from "@/lib/prisma";
import { getModel, getProviderApiKey, resolveProvider } from "@/lib/ai/providers";
import { createSearchKnowledgeTool } from "@/lib/agents/tools";
import { trackAIUsage } from "@/lib/ai/call";

const ROLE_MENTIONS = ["taskexecutor", "frontend", "backend", "devops", "teamlead", "cursor", "qa", "css"] as const;
const AGENT_ROLE_MAP: Record<string, "TASK_EXECUTOR" | "BACKEND" | "DEVOPS" | "TEAMLEAD" | "CURSOR" | "QA" | "CSS"> = {
  taskexecutor: "TASK_EXECUTOR",
  frontend: "TASK_EXECUTOR", // legacy alias
  backend: "BACKEND",
  devops: "DEVOPS",
  teamlead: "TEAMLEAD",
  cursor: "CURSOR",
  qa: "QA",
  css: "CSS",
};

function extractMention(content: string) {
  const match = content.match(/@(taskexecutor|frontend|backend|devops|teamlead|cursor|qa|css)/i);
  const role = match?.[1]?.toLowerCase();
  if (!role || !ROLE_MENTIONS.includes(role as (typeof ROLE_MENTIONS)[number])) {
    return null;
  }
  return AGENT_ROLE_MAP[role];
}

/** Вопрос к агенту: содержит "?" или начинается с /ask или /вопрос */
function isQuestionToExecutor(content: string): boolean {
  const t = content.trim();
  if (t.includes("?")) return true;
  const lower = t.toLowerCase();
  if (lower.startsWith("/ask") || lower.startsWith("/вопрос")) return true;
  return false;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get("taskId");

    if (!taskId) {
      return NextResponse.json({ error: "taskId is required" }, { status: 400 });
    }

    const comments = await prisma.comment.findMany({
      where: { taskId },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ comments });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[comments:get]", error);
    }
    return NextResponse.json({ error: "Failed to fetch comments" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const taskId = typeof body?.taskId === "string" ? body.taskId : "";
    const content = typeof body?.content === "string" ? body.content.trim() : "";
    const authorRole = typeof body?.authorRole === "string" ? body.authorRole : "TEAMLEAD";

    if (!taskId) {
      return NextResponse.json({ error: "taskId is required" }, { status: 400 });
    }

    if (!content) {
      return NextResponse.json({ error: "content is required" }, { status: 400 });
    }

    const validRoles = ["TASK_EXECUTOR", "BACKEND", "DEVOPS", "TEAMLEAD", "CURSOR", "QA", "CSS"] as const;
    const normalizedRole = validRoles.includes(authorRole as (typeof validRoles)[number])
      ? (authorRole as (typeof validRoles)[number])
      : "TEAMLEAD";

    const userComment = await prisma.comment.create({
      data: {
        taskId,
        content,
        authorRole: normalizedRole,
      },
    });

    // Кого спрашиваем: явный @role или вопрос к исполнителю задачи
    let agentRole = extractMention(content);
    if (!agentRole) {
      const taskForExecutor = await prisma.task.findUnique({
        where: { id: taskId },
        select: { executorAgent: true },
      });
      if (
        taskForExecutor?.executorAgent &&
        isQuestionToExecutor(content)
      ) {
        agentRole = taskForExecutor.executorAgent;
      }
    }

    let agentComment = null;

    // Ping/pong — quick health check, no LLM call
    const isPing = /^\s*ping\s*$/i.test(content);
    if (isPing) {
      const taskForPing = await prisma.task.findUnique({
        where: { id: taskId },
        select: { executorAgent: true },
      });
      const pongRole = taskForPing?.executorAgent ?? "TEAMLEAD";
      agentComment = await prisma.comment.create({
        data: {
          taskId,
          content: "pong",
          authorRole: pongRole,
        },
      });
    } else if (agentRole) {
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
        },
      });

      if (task && task.plan?.project) {
        const project = task.plan.project;
        const globalContext = project.context?.trim() ?? "";
        const contextInstruction = globalContext
          ? ` Учитывай глобальный контекст проекта при генерации ответа: ${globalContext}.`
          : "";

        const recentComments = await prisma.comment.findMany({
          where: { taskId },
          orderBy: { createdAt: "asc" },
          take: 50,
        });
        const lastN = recentComments.slice(-5);
        const commentsBlock =
          lastN.length > 0
            ? "Последние сообщения в обсуждении:\n" +
              lastN
                .map(
                  (c) =>
                    `[${c.authorRole}]: ${c.content}`
                )
                .join("\n")
            : "";

        const generatedPromptBlock = task.generatedPrompt?.trim()
          ? `Сгенерированный промпт задачи (твои инструкции для реализации — опирайся на него при ответах типа "почему X?"):\n${task.generatedPrompt}`
          : "Сгенерированного промпта задачи пока нет — отвечай исходя из описания задачи.";

        const deps = task.dependencies ?? [];
        const incompleteDeps = deps.filter((d) => d.dependsOn.status !== "DONE");
        const blockedInstruction =
          incompleteDeps.length > 0
            ? `\n\nВАЖНО: Эта задача заблокирована незавершёнными задачами: ${incompleteDeps.map((d) => `«${d.dependsOn.title}»`).join(", ")}. Если пользователь собирается начать эту задачу или спрашивает о ней — предупреди, что сначала нужно завершить указанные задачи.`
            : "";

        const system =
          `Ты — участник команды. Твоя роль: ${agentRole}. Если вопрос касается проекта, используй инструмент \`searchKnowledge\`, чтобы найти ответ в файлах проекта. Отвечай как опытный инженер. Давай короткие и практичные рекомендации.` +
          contextInstruction +
          `\n\nОписание задачи: ${task.title}\n${task.description}\n\n${generatedPromptBlock}\n\n${commentsBlock}` +
          blockedInstruction;

        const prompt =
          `Контекст проекта: ${project.ideaText}\n` +
          (globalContext ? `Глобальный контекст проекта: ${globalContext}\n` : "") +
          `План: ${task.plan.title}\n` +
          `Описание плана: ${task.plan.description ?? ""}\n` +
          `Сообщение пользователя (ответь на него): ${content}`;

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
        if (!getProviderApiKey(resolvedProvider)) {
          throw new Error(`Missing API key for provider: ${resolvedProvider}`);
        }
        const searchKnowledge = createSearchKnowledgeTool(project.id);
        const result = await generateText({
          model: getModel(resolvedProvider, resolvedModel),
          system,
          prompt,
          tools: {
            searchKnowledge
          },
          maxSteps: 5,
          temperature: 0.4,
          maxTokens: 1000,
        });

        await trackAIUsage(result, { projectId: project.id, taskId, actionType: "chat", model: resolvedModel });

        agentComment = await prisma.comment.create({
          data: {
            taskId,
            content: result.text?.trim() || "(Нет ответа)",
            authorRole: agentRole,
          },
        });
      }
    }

    return NextResponse.json({ success: true, comment: userComment, agentComment });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[comments:post]", error);
    }
    return NextResponse.json({ error: "Failed to create comment" }, { status: 500 });
  }
}
