import { prisma } from "@/lib/prisma";
import { calculateCost } from "./pricing";
import { ExecutionSessionManager } from "@/lib/execution/session-manager";

interface AIUsageResponse {
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  model?: string;
}

interface TrackAIUsageContext {
  projectId: string;
  taskId?: string;
  planId?: string;
  actionType: string;
  model: string;
  executionSessionId?: string;
}

export async function trackAIUsage(response: AIUsageResponse, context: TrackAIUsageContext) {
  const { projectId, taskId, actionType, model, executionSessionId } = context;

  const promptTokens = response.usage?.promptTokens ?? 0;
  const completionTokens = response.usage?.completionTokens ?? 0;

  if (promptTokens === 0 && completionTokens === 0) {
    return;
  }

  const cost = calculateCost(model, promptTokens, completionTokens);

  await prisma.tokenUsage.create({
    data: {
      projectId,
      taskId,
      model,
      promptTokens,
      completionTokens,
      cost,
      actionType,
    },
  });

  if (executionSessionId) {
    const sessionManager = ExecutionSessionManager.getInstance();
    await sessionManager.updateCost(executionSessionId, cost);
  }
}

export async function trackEmbeddingUsage(projectId: string, model: string, promptTokens: number, actionType: string) {
  const cost = calculateCost(model, promptTokens, 0);

  await prisma.tokenUsage.create({
    data: {
      projectId,
      taskId: null,
      model,
      promptTokens,
      completionTokens: 0,
      cost,
      actionType,
    },
  });
}
