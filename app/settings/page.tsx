"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Check, Key, Sliders } from "lucide-react";
import { cn } from "@/lib/utils";

type KeysState = Record<string, { set: boolean; masked: string; label: string }>;
type DefaultsState = {
  defaultMaxTokens: number;
  defaultTemperature: number;
  defaultAiProvider: string;
  defaultAiModel: string;
};

const PROVIDER_OPTIONS = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "zai", label: "Z.ai" },
];

export default function SettingsPage() {
  const [keys, setKeys] = useState<KeysState>({});
  const [defaults, setDefaults] = useState<DefaultsState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [form, setForm] = useState<DefaultsState>({
    defaultMaxTokens: 4096,
    defaultTemperature: 0.2,
    defaultAiProvider: "openai",
    defaultAiModel: "gpt-4o-mini",
  });
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error("Load failed");
      const data = await res.json();
      setKeys(data.keys ?? {});
      setDefaults(data.defaults ?? null);
      if (data.defaults) {
        setForm({
          defaultMaxTokens: data.defaults.defaultMaxTokens ?? 4096,
          defaultTemperature: data.defaults.defaultTemperature ?? 0.2,
          defaultAiProvider: data.defaults.defaultAiProvider ?? "openai",
          defaultAiModel: data.defaults.defaultAiModel ?? "gpt-4o-mini",
        });
      }
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Ошибка загрузки настроек",
        description: e instanceof Error ? e.message : "Попробуйте позже",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultMaxTokens: form.defaultMaxTokens,
          defaultTemperature: form.defaultTemperature,
          defaultAiProvider: form.defaultAiProvider,
          defaultAiModel: form.defaultAiModel,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      const data = await res.json();
      setKeys(data.keys ?? keys);
      setDefaults(data.defaults ?? null);
      setDirty(false);
      toast({ title: "Настройки сохранены" });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Ошибка сохранения",
        description: e instanceof Error ? e.message : "Попробуйте позже",
      });
    } finally {
      setSaving(false);
    }
  };

  const updateForm = (patch: Partial<DefaultsState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Настройки</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          API-ключи задаются в .env. Остальные параметры можно сохранить здесь.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            API-ключи и URL (из .env)
          </CardTitle>
          <CardDescription>
            Значения берутся из переменных окружения. Чтобы изменить, отредактируйте .env и перезапустите сервер.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {Object.entries(keys).map(([key, { set, masked, label }]) => (
            <div key={key} className="space-y-1.5">
              <Label className="text-muted-foreground">{label}</Label>
              <div
                className={cn(
                  "flex h-10 w-full items-center rounded-md border border-input bg-muted/50 px-3 py-2 font-mono text-sm",
                  set ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {set ? (
                  <span title="Задан (видны первые и последние 3 символа)">
                    {masked || "***"}
                  </span>
                ) : (
                  <span>Не задан</span>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sliders className="h-5 w-5" />
            Параметры по умолчанию
          </CardTitle>
          <CardDescription>
            Используются при генерации планов и выполнении задач (maxTokens, temperature, провайдер, модель).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="defaultMaxTokens">Max tokens</Label>
              <Input
                id="defaultMaxTokens"
                type="number"
                min={256}
                max={128000}
                step={256}
                value={form.defaultMaxTokens}
                onChange={(e) => updateForm({ defaultMaxTokens: e.target.valueAsNumber || 4096 })}
              />
              <p className="text-xs text-muted-foreground">
                Лимит токенов ответа (например 4096, 8192). Больше — длиннее планы.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="defaultTemperature">Temperature</Label>
              <Input
                id="defaultTemperature"
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={form.defaultTemperature}
                onChange={(e) => updateForm({ defaultTemperature: e.target.valueAsNumber ?? 0.2 })}
              />
              <p className="text-xs text-muted-foreground">
                0–2. Ниже — стабильнее, выше — разнообразнее.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="defaultAiProvider">Провайдер по умолчанию</Label>
            <select
              id="defaultAiProvider"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={form.defaultAiProvider}
              onChange={(e) => updateForm({ defaultAiProvider: e.target.value })}
            >
              {PROVIDER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="defaultAiModel">Модель по умолчанию</Label>
            <Input
              id="defaultAiModel"
              placeholder="gpt-4o-mini"
              value={form.defaultAiModel}
              onChange={(e) => updateForm({ defaultAiModel: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Например: gpt-4o-mini, claude-3-5-sonnet-latest, glm-4.7
            </p>
          </div>
          <Button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="gap-2"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Сохранить
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
