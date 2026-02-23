import { prisma } from "@/lib/prisma";

const SETTING_KEYS = {
  DEFAULT_MAX_TOKENS: "defaultMaxTokens",
  DEFAULT_TEMPERATURE: "defaultTemperature",
  DEFAULT_AI_PROVIDER: "defaultAiProvider",
  DEFAULT_AI_MODEL: "defaultAiModel",
} as const;

const ENV_KEYS = [
  { key: "OPENAI_API_KEY", label: "OpenAI API Key", envKey: "OPENAI_API_KEY" },
  { key: "OPENAI_BASE_URL", label: "OpenAI Base URL", envKey: "OPENAI_BASE_URL" },
  { key: "ANTHROPIC_API_KEY", label: "Anthropic API Key", envKey: "ANTHROPIC_API_KEY" },
  { key: "OPENROUTER_API_KEY", label: "OpenRouter API Key", envKey: "OPENROUTER_API_KEY" },
  { key: "OPENROUTER_BASE_URL", label: "OpenRouter Base URL", envKey: "OPENROUTER_BASE_URL" },
  { key: "ZAI_API_KEY", label: "Z.ai API Key", envKey: "ZAI_API_KEY" },
  { key: "ZAI_BASE_URL", label: "Z.ai Base URL", envKey: "ZAI_BASE_URL" },
] as const;

/** Маска секрета: первые 3 и последние 3 символа видны, середина — звёздочки. */
export function maskSecret(value: string | undefined): string {
  if (!value || typeof value !== "string") return "";
  const s = value.trim();
  if (s.length <= 6) return "***";
  if (s.length <= 9) return s.slice(0, 3) + "***" + s.slice(-3);
  return s.slice(0, 3) + "***" + s.slice(-3);
}

export function getEnvKeyMasked(envKey: string): { set: boolean; masked: string } {
  const raw = process.env[envKey];
  const set = !!raw?.trim();
  return { set, masked: maskSecret(raw) };
}

export type SettingsPublic = {
  keys: Record<string, { set: boolean; masked: string; label: string }>;
  defaults: {
    defaultMaxTokens: number;
    defaultTemperature: number;
    defaultAiProvider: string;
    defaultAiModel: string;
  };
};

const DEFAULTS = {
  defaultMaxTokens: 4096,
  defaultTemperature: 0.2,
  defaultAiProvider: process.env.AI_PROVIDER?.trim() || "openai",
  defaultAiModel: process.env.AI_MODEL?.trim() || "gpt-4o-mini",
};

/** Настройки для LLM-вызовов: читает из БД с безопасными fallback. */
export type LLMSettings = {
  maxTokens: number;
  temperature: number;
  defaultProvider: string;
  defaultModel: string;
};

const LLM_FALLBACK: LLMSettings = {
  maxTokens: 8192,
  temperature: 0.2,
  defaultProvider: process.env.AI_PROVIDER?.trim() || "openai",
  defaultModel: process.env.AI_MODEL?.trim() || "gpt-4o-mini",
};

export async function getLLMSettings(): Promise<LLMSettings> {
  const rows = await prisma.setting.findMany({
    where: { key: { in: Object.values(SETTING_KEYS) } },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const maxTokensRaw = map.get(SETTING_KEYS.DEFAULT_MAX_TOKENS);
  const temperatureRaw = map.get(SETTING_KEYS.DEFAULT_TEMPERATURE);
  const maxTokens = maxTokensRaw != null ? parseInt(String(maxTokensRaw), 10) : NaN;
  const temperature = temperatureRaw != null ? parseFloat(String(temperatureRaw)) : NaN;

  return {
    maxTokens: Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : LLM_FALLBACK.maxTokens,
    temperature: Number.isFinite(temperature) && temperature >= 0 && temperature <= 2
      ? temperature
      : LLM_FALLBACK.temperature,
    defaultProvider: map.get(SETTING_KEYS.DEFAULT_AI_PROVIDER)?.trim() || LLM_FALLBACK.defaultProvider,
    defaultModel: map.get(SETTING_KEYS.DEFAULT_AI_MODEL)?.trim() || LLM_FALLBACK.defaultModel,
  };
}

export async function getPublicSettings(): Promise<SettingsPublic> {
  const keys: SettingsPublic["keys"] = {};
  for (const { key, label, envKey } of ENV_KEYS) {
    const { set, masked } = getEnvKeyMasked(envKey);
    keys[key] = { set, masked, label };
  }

  const rows = await prisma.setting.findMany({
    where: { key: { in: Object.values(SETTING_KEYS) } },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const defaultMaxTokens = parseInt(map.get(SETTING_KEYS.DEFAULT_MAX_TOKENS) ?? "", 10);
  const defaultTemperature = parseFloat(map.get(SETTING_KEYS.DEFAULT_TEMPERATURE) ?? "");

  return {
    keys,
    defaults: {
      defaultMaxTokens: Number.isFinite(defaultMaxTokens) ? defaultMaxTokens : DEFAULTS.defaultMaxTokens,
      defaultTemperature: Number.isFinite(defaultTemperature) ? defaultTemperature : DEFAULTS.defaultTemperature,
      defaultAiProvider: map.get(SETTING_KEYS.DEFAULT_AI_PROVIDER) ?? DEFAULTS.defaultAiProvider,
      defaultAiModel: map.get(SETTING_KEYS.DEFAULT_AI_MODEL) ?? DEFAULTS.defaultAiModel,
    },
  };
}

export type SettingsUpdate = Partial<{
  defaultMaxTokens: number;
  defaultTemperature: number;
  defaultAiProvider: string;
  defaultAiModel: string;
}>;

export async function updateSettings(update: SettingsUpdate): Promise<void> {
  const entries: [string, string][] = [];
  if (update.defaultMaxTokens !== undefined)
    entries.push([SETTING_KEYS.DEFAULT_MAX_TOKENS, String(update.defaultMaxTokens)]);
  if (update.defaultTemperature !== undefined)
    entries.push([SETTING_KEYS.DEFAULT_TEMPERATURE, String(update.defaultTemperature)]);
  if (update.defaultAiProvider !== undefined)
    entries.push([SETTING_KEYS.DEFAULT_AI_PROVIDER, update.defaultAiProvider]);
  if (update.defaultAiModel !== undefined)
    entries.push([SETTING_KEYS.DEFAULT_AI_MODEL, update.defaultAiModel]);

  for (const [key, value] of entries) {
    await prisma.setting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }
}
