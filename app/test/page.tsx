"use client";

import { useState } from "react";
import { Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ProviderOption = "openai" | "anthropic" | "zai";

const PROVIDER_MODELS: Record<ProviderOption, { label: string; value: string }[]> = {
  openai: [
    { label: "GPT-4o mini", value: "gpt-4o-mini" },
    { label: "GPT-4.1 mini", value: "gpt-4.1-mini" },
    { label: "GPT-4o", value: "gpt-4o" }
  ],
  anthropic: [
    { label: "Claude 3.5 Sonnet", value: "claude-3-5-sonnet-latest" },
    { label: "Claude 3.5 Haiku", value: "claude-3-5-haiku-latest" }
  ],
  zai: [
    { label: "GLM-4.7", value: "glm-4.7" },
    { label: "GLM-4.5", value: "glm-4.5" }
  ]
};

export default function TestPage() {
  const [message, setMessage] = useState("ping");
  const [reply, setReply] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [provider, setProvider] = useState<ProviderOption>("zai");
  const [model, setModel] = useState<string>(PROVIDER_MODELS.zai[0].value);

  async function handleSend(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!message.trim() || isSending) {
      return;
    }

    setIsSending(true);
    setReply(null);

    try {
      const response = await fetch("/api/test-llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, provider, model })
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Ошибка отправки");
      }

      setReply(payload.reply);
    } catch (error) {
      setReply(error instanceof Error ? error.message : "Ошибка отправки");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-16">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold">Тест LLM</h1>
          <p className="text-sm text-slate-400">
            Отправьте короткое сообщение, чтобы проверить провайдер и модель.
          </p>
        </header>

        <form onSubmit={handleSend} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Провайдер
              </label>
              <select
                value={provider}
                onChange={(event) => {
                  const nextProvider = event.target.value as ProviderOption;
                  setProvider(nextProvider);
                  setModel(PROVIDER_MODELS[nextProvider][0].value);
                }}
                className="h-11 w-full rounded-md border border-slate-800 bg-slate-900 px-3 text-sm text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-600"
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="zai">Z.ai (GLM)</option>
              </select>
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Модель
              </label>
              <select
                value={model}
                onChange={(event) => setModel(event.target.value)}
                className="h-11 w-full rounded-md border border-slate-800 bg-slate-900 px-3 text-sm text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-600"
              >
                {PROVIDER_MODELS[provider].map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex gap-3">
            <Input
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Напишите ping..."
              className="h-12 bg-slate-900 text-slate-100 placeholder:text-slate-500"
            />
            <Button type="submit" className="h-12 px-4" disabled={isSending}>
              <Send className="mr-2 h-4 w-4" />
              {isSending ? "Отправка..." : "Отправить"}
            </Button>
          </div>
        </form>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Ответ</p>
          <p className="mt-2 text-lg font-semibold">
            {reply ?? "(пока нет ответа)"}
          </p>
        </div>
      </div>
    </div>
  );
}
