import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";

export type AiProvider = "openai" | "anthropic" | "openrouter" | "zai";

const openaiProvider = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  // Only set baseURL when non-empty; otherwise SDK uses default https://api.openai.com/v1
  ...(process.env.OPENAI_BASE_URL?.trim() && { baseURL: process.env.OPENAI_BASE_URL.trim() }),
});

const openrouterProvider = createOpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1"
});

// Z.ai: use api/coding/paas/v4 for GLM Coding Plan (subscription); api/paas/v4 for pay-as-you-go Model API
const zaiProvider = createOpenAI({
  apiKey: process.env.ZAI_API_KEY,
  baseURL:
    process.env.ZAI_BASE_URL?.trim() ||
    "https://api.z.ai/api/coding/paas/v4"
});

const anthropicProvider = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

export function getModel(provider: AiProvider, model: string) {
  switch (provider) {
    case "openai":
      return openaiProvider(model);
    case "anthropic":
      return anthropicProvider(model);
    case "openrouter":
      return openrouterProvider(model);
    case "zai":
      return zaiProvider(model);
    default:
      return openaiProvider(model);
  }
}

export function resolveProvider(input?: string): AiProvider {
  const normalized = (input || "").toLowerCase();
  if (normalized === "anthropic" || normalized === "openrouter") {
    return normalized;
  }
  if (normalized === "zai" || normalized === "z.ai" || normalized === "glm") {
    return "zai";
  }
  return "openai";
}

export function getProviderApiKey(provider: AiProvider): string | undefined {
  switch (provider) {
    case "openai":
      return process.env.OPENAI_API_KEY;
    case "anthropic":
      return process.env.ANTHROPIC_API_KEY;
    case "openrouter":
      return process.env.OPENROUTER_API_KEY;
    case "zai":
      return process.env.ZAI_API_KEY;
    default:
      return process.env.OPENAI_API_KEY;
  }
}
