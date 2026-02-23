import { NextResponse } from "next/server";
import { generateText } from "ai";

import { getModel, getProviderApiKey, resolveProvider } from "@/lib/ai/providers";
import { generateTextZai } from "@/lib/ai/zai";

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const message = typeof body?.message === "string" ? body.message : "";
    const providerInput = typeof body?.provider === "string" ? body.provider : "zai";
    const modelInput = typeof body?.model === "string" ? body.model : "glm-4.7";

    if (!message.trim()) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    const provider = resolveProvider(providerInput);
    const apiKey = getProviderApiKey(provider);
    if (!apiKey) {
      return NextResponse.json(
        { error: `Missing API key for provider: ${provider}` },
        { status: 500 }
      );
    }

    const systemPrompt = "You are a test agent. Reply with a single word or short phrase.";

    if (provider === "zai") {
      const text = await generateTextZai({
        systemPrompt,
        userMessage: message,
        model: modelInput,
        temperature: 0.2,
        maxTokens: 128,
      });
      return NextResponse.json({ reply: text });
    }

    const model = getModel(provider, modelInput);
    const result = await generateText({
      model,
      system: systemPrompt,
      prompt: `Reply to: ${message}`,
      temperature: 0.2,
      maxTokens: 128,
    });

    return NextResponse.json({ reply: result.text ?? "" });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : error != null ? String(error) : "Failed to call LLM";
    if (process.env.NODE_ENV !== "production") {
      console.error("[test-llm]", error);
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
