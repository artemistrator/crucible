import { generateText } from "ai";
import { prisma } from "@/lib/prisma";
import { getModel, resolveProvider } from "@/lib/ai/providers";
import { trackAIUsage } from "@/lib/ai/call";

export async function generateADR(projectId: string, planId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  const plan = await prisma.plan.findUnique({
    where: { id: planId },
  });

  if (!project || !plan) {
    throw new Error("Project or plan not found");
  }

  const prompt = `Ты — Software Architect. Мы начинаем проект "${project.ideaText}".
Выбран план: "${plan.title}".
Стек: ${plan.techStack}.

${plan.description ? `Описание плана: ${plan.description}` : ""}
${plan.reasoning ? `Обоснование выбора: ${plan.reasoning}` : ""}

Напиши **Architecture Decision Record (ADR)** в формате Markdown.

Структура:
# ADR-001: Выбор архитектуры и стека
## Status
Accepted
## Context
[Описание идеи проекта]
## Decision
Мы выбрали [План] и стек [Стек], потому что...
## Consequences
Плюсы: ...
Минусы: ...`;

  const resolvedProvider = resolveProvider(project.aiProvider ?? undefined);
  const resolvedModel = project.aiModel ?? "gpt-4o-mini";
  const model = getModel(resolvedProvider, resolvedModel);
  const modelDisplay = project.aiModel ?? `${resolvedProvider}/${resolvedModel}`;

  const result = await generateText({
    model,
    system: "Ты опытный Software Architect. Пиши чёткие и структурированные ADR. У тебя есть доступ в интернет через webSearch. Если нужна свежая документация — ГУГЛИ. Не гадай.",
    prompt,
    temperature: 0.3,
  });

  await trackAIUsage(result, { projectId, planId, actionType: "generate-adr", model: modelDisplay });

  return result.text;
}

export async function saveDocToClient(projectId: string, fileName: string, content: string) {
  const command = await prisma.syncCommand.create({
    data: {
      projectId,
      command: `Create file: docs/adr/${fileName}`,
      type: "WRITE_FILE",
      filePath: `docs/adr/${fileName}`,
      fileContent: content,
    },
  });

  return command;
}