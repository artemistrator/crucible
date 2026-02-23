"use client";

import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, RefreshCw, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import {
  IconOpenAI,
  IconAnthropic,
  IconZai,
  IconSend,
} from "@/components/ProviderIcons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Plan = {
  id: string;
  title: string;
  description?: string | null;
  techStack: string;
  relevanceScore?: number | null;
};

type ProviderOption = "openai" | "anthropic" | "zai";

const PROVIDER_MODELS: Record<ProviderOption, { label: string; value: string }[]> =
  {
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

const MODEL_BADGES: Record<string, "fast" | "smart"> = {
  "gpt-4o": "smart",
  "gpt-4o-mini": "fast",
  "gpt-4.1-mini": "fast",
  "claude-3-5-sonnet-latest": "smart",
  "claude-3-5-haiku-latest": "fast",
  "glm-4.7": "smart",
  "glm-4.5": "fast",
};

const PROVIDER_LIST: { id: ProviderOption; label: string; dot: string }[] = [
  { id: "openai", label: "OpenAI", dot: "bg-white" },
  { id: "anthropic", label: "Anthropic", dot: "bg-amber-400" },
  { id: "zai", label: "Z.ai", dot: "bg-blue-500" },
];

const LOADING_PHRASES = [
  "Отправляем запрос в LLM…",
  "Ждём ответ…",
  "Генерируем планы…",
];

type Project = {
  id: string;
  ideaText: string;
  createdAt: string | Date;
};

export default function HomePage() {
  const [ideaText, setIdeaText] = useState("");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [provider, setProvider] = useState<ProviderOption>("openai");
  const [model, setModel] = useState<string>(PROVIDER_MODELS.openai[0].value);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<"new" | "evolve">("new");
  const [selectedBaseProjectId, setSelectedBaseProjectId] = useState<string | null>(null);
  const [availableProjects, setAvailableProjects] = useState<Project[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [modelPopoverOpen, setModelPopoverOpen] = useState(false);
  const [view, setView] = useState<"form" | "loading">("form");
  const [loadingPhraseIndex, setLoadingPhraseIndex] = useState(0);
  const modelPopoverRef = useRef<HTMLDivElement>(null);
  const modelButtonRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const { toast } = useToast();

  const currentModelLabel = useMemo(
    () => PROVIDER_MODELS[provider].find((m) => m.value === model)?.label ?? model,
    [provider, model]
  );

  const loadProjects = useCallback(async () => {
    if (mode === "evolve") {
      setIsLoadingProjects(true);
      try {
        const { getCompletedProjects } = await import("@/app/actions/get-completed-projects");
        const projects = await getCompletedProjects();
        setAvailableProjects(projects.map(p => ({
          ...p,
          createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt
        })));
      } catch (error) {
        console.error("Failed to load projects:", error);
        toast({
          variant: "destructive",
          title: "Не удалось загрузить проекты",
          description: "Попробуйте позже или выберите режим создания нового проекта",
        });
      } finally {
        setIsLoadingProjects(false);
      }
    }
  }, [mode, toast]);

  // Load projects when switching to evolve mode
  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Close model popover on click outside
  useEffect(() => {
    if (!modelPopoverOpen) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        modelPopoverRef.current?.contains(target) ||
        modelButtonRef.current?.contains(target)
      )
        return;
      setModelPopoverOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [modelPopoverOpen]);

  // Cycle loading phrases while in loading view
  useEffect(() => {
    if (view !== "loading") return;
    const interval = setInterval(() => {
      setLoadingPhraseIndex((i) => (i + 1) % LOADING_PHRASES.length);
    }, 2300);
    return () => clearInterval(interval);
  }, [view]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ideaText.trim() || isSubmitting) {
      return;
    }

    // If evolve mode, require base project selection
    if (mode === "evolve" && !selectedBaseProjectId) {
      toast({
        variant: "destructive",
        title: "Выберите проект",
        description: "Для доработки необходимо выбрать существующий проект",
      });
      return;
    }

    setIsSubmitting(true);
    setIsLoading(true);
    setPlans([]);
    setProjectId(null);
    setView("loading");

    try {
      const response = await fetch("/api/decompose-idea", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ideaText: ideaText.trim(),
          provider,
          model,
          baseProjectId: mode === "evolve" ? selectedBaseProjectId : null,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || "Не удалось сгенерировать планы");
      }

      const payload = await response.json();
      const nextPlans = Array.isArray(payload?.plans) ? payload.plans : [];
      const nextProjectId =
        typeof payload?.projectId === "string" ? payload.projectId : null;
      setPlans(nextPlans);
      setProjectId(nextProjectId);

      if (mode === "evolve" && selectedBaseProjectId && nextProjectId) {
        console.info("[HomePage] Evolve mode: created new project", {
          baseProjectId: selectedBaseProjectId,
          newProjectId: nextProjectId,
        });
        toast({
          title: "Создана копия проекта",
          description: "Сгенерированы варианты доработки проекта. Оригинальный проект остается нетронутым.",
        });
      } else {
        toast({
          title: "Планы готовы",
          description: "Сгенерированы 3 архитектурные опции.",
        });
      }

      if (nextProjectId) {
        router.push(`/project/${nextProjectId}`);
      }
    } catch (submitError) {
      setView("form");
      toast({
        variant: "destructive",
        title: "Не удалось получить планы",
        description:
          submitError instanceof Error
            ? submitError.message
            : "Произошла ошибка"
      });
    } finally {
      setIsSubmitting(false);
      setIsLoading(false);
    }
  }

  return (
    <div
      className={cn(
        "min-h-screen",
        "bg-gradient-to-br from-slate-50 via-white to-slate-100",
        "dark:bg-[#0a0a0f] dark:bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(99,102,241,0.12),transparent)]"
      )}
    >
      <div className="flex h-[calc(100vh-6rem)] w-full flex-col items-stretch gap-10 overflow-hidden px-6 py-12">
        <header className="shrink-0 w-full space-y-4 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
            AI Orchestrator
          </p>
          <h1 className="text-3xl font-semibold text-slate-900 dark:text-slate-50 sm:text-4xl">
            Превращаем сложные идеи в понятный план разработки
          </h1>
          <p className="mx-auto max-w-2xl text-base text-slate-600 dark:text-slate-300">
            Опишите задумку — мы разложим её на архитектурные блоки и этапы.
          </p>
        </header>

        <section className="flex min-h-0 flex-1 w-full flex-col gap-6 overflow-hidden">
          {view === "form" && (
          <form
            onSubmit={handleSubmit}
            className={cn(
              "mx-auto w-full max-w-[760px] rounded-[20px] p-6 shadow-lg backdrop-blur-[20px]",
              "border bg-white/90 border-slate-200/80",
              "dark:border-[rgba(255,255,255,0.08)] dark:bg-[rgba(255,255,255,0.04)] dark:shadow-[0_32px_80px_rgba(0,0,0,0.4)]"
            )}
          >
            {/* Mode tabs */}
            <div className="mb-4 flex w-full gap-2">
              <button
                type="button"
                onClick={() => setMode("new")}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium transition-colors",
                  mode === "new"
                    ? "border border-indigo-500/30 bg-indigo-500/15 text-indigo-400 dark:text-[#a5b4fc]"
                    : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
                )}
              >
                <Plus className="h-4 w-4" />
                Новый проект
              </button>
              <button
                type="button"
                onClick={() => setMode("evolve")}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium transition-colors",
                  mode === "evolve"
                    ? "border border-indigo-500/30 bg-indigo-500/15 text-indigo-400 dark:text-[#a5b4fc]"
                    : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
                )}
              >
                <RefreshCw className="h-4 w-4" />
                Развить проект
              </button>
            </div>

            {/* Project selector (evolve only) */}
            {mode === "evolve" && (
              <div className="mb-4 flex items-center gap-2">
                <Select
                  value={selectedBaseProjectId || ""}
                  onValueChange={setSelectedBaseProjectId}
                  disabled={isLoadingProjects}
                >
                  <SelectTrigger
                    className={cn(
                      "max-w-md rounded-xl border bg-slate-100/80 text-slate-700 placeholder:text-slate-500",
                      "dark:border-[rgba(255,255,255,0.1)] dark:bg-[rgba(255,255,255,0.05)] dark:text-slate-200 dark:placeholder:text-slate-400"
                    )}
                  >
                    <SelectValue
                      placeholder={
                        isLoadingProjects
                          ? "Загрузка..."
                          : "Выберите проект для доработки"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent
                    className={cn(
                      "rounded-xl border border-slate-200 bg-white dark:border-[rgba(255,255,255,0.1)] dark:bg-[rgba(18,18,28,0.98)]"
                    )}
                  >
                    {availableProjects.length === 0 ? (
                      <div className="px-2 py-1.5 text-sm text-slate-500 dark:text-slate-400">
                        {isLoadingProjects
                          ? "Загрузка..."
                          : "Нет завершённых проектов. Создайте новый проект."}
                      </div>
                    ) : (
                      availableProjects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.ideaText.slice(0, 60)}
                          {project.ideaText.length > 60 ? "..." : ""}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0 rounded-lg border-slate-200 dark:border-[rgba(255,255,255,0.1)]"
                  onClick={loadProjects}
                  disabled={isLoadingProjects}
                  title="Обновить список проектов"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${isLoadingProjects ? "animate-spin" : ""}`}
                  />
                </Button>
              </div>
            )}

            {/* Textarea */}
            <textarea
              placeholder={
                mode === "evolve"
                  ? "Выберите проект и опишите, что хотите доработать (например: «Добавить блог» или «Добавить авторизацию»)..."
                  : "Опишите продукт или систему, которую хотите построить..."
              }
              className={cn(
                "min-h-[120px] w-full resize-y rounded-lg border-0 bg-transparent px-0 py-2 text-[15px] focus:outline-none focus:ring-0",
                "text-slate-900 placeholder:text-slate-400",
                "dark:text-[rgba(255,255,255,0.85)] dark:placeholder:text-[rgba(255,255,255,0.2)]"
              )}
              value={ideaText}
              onChange={(e) => setIdeaText(e.target.value)}
              rows={4}
            />

            {/* Bottom bar: model selector + send */}
            <div
              className={cn(
                "mt-4 flex items-center justify-between border-t pt-4",
                "border-slate-200 dark:border-[rgba(255,255,255,0.06)]"
              )}
            >
              <div className="relative" ref={modelPopoverRef}>
                <button
                  ref={modelButtonRef}
                  type="button"
                  onClick={() => setModelPopoverOpen((v) => !v)}
                  className={cn(
                    "flex items-center gap-2 rounded-[10px] border px-3.5 py-2 text-sm transition-colors",
                    "border-slate-200 bg-slate-100/80 text-slate-600 hover:bg-slate-200/80",
                    "dark:border-[rgba(255,255,255,0.1)] dark:bg-[rgba(255,255,255,0.04)] dark:text-slate-400 dark:hover:bg-[rgba(255,255,255,0.08)]"
                  )}
                  aria-label="Выбрать модель"
                >
                  <span className="flex h-[22px] w-[22px] items-center justify-center overflow-hidden rounded-md bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                    {provider === "openai" && <IconOpenAI className="h-3.5 w-3.5" />}
                    {provider === "anthropic" && <IconAnthropic className="h-3.5 w-3.5" />}
                    {provider === "zai" && <IconZai className="h-3.5 w-3.5" />}
                  </span>
                  <span className="max-w-[140px] truncate">{currentModelLabel}</span>
                  <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
                </button>

                {/* Model selector popover */}
                {modelPopoverOpen && (
                  <div
                    className={cn(
                      "absolute bottom-full left-0 z-50 mt-0 w-[420px] overflow-hidden rounded-2xl border shadow-xl backdrop-blur-[24px]",
                      "animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-200",
                      "border-slate-200 bg-white/95 dark:border-[rgba(255,255,255,0.1)] dark:bg-[rgba(18,18,28,0.96)] dark:shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
                    )}
                    style={{ bottom: "calc(100% + 8px)" }}
                  >
                    <div className="flex min-h-[200px]">
                      {/* Providers column */}
                      <div
                        className={cn(
                          "w-[140px] shrink-0 border-r border-slate-200 py-2 dark:border-[rgba(255,255,255,0.06)]"
                        )}
                      >
                        {PROVIDER_LIST.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setProvider(p.id);
                              setModel(PROVIDER_MODELS[p.id][0].value);
                            }}
                            className={cn(
                              "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                              provider === p.id
                                ? "bg-slate-100 text-slate-900 dark:bg-[rgba(255,255,255,0.08)] dark:text-white"
                                : "text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-[rgba(255,255,255,0.04)]"
                            )}
                          >
                            <span
                              className={cn("h-2 w-2 shrink-0 rounded-full", p.dot)}
                            />
                            {p.label}
                          </button>
                        ))}
                      </div>
                      {/* Models column */}
                      <div className="flex flex-1 flex-col py-2 pl-3 pr-2">
                        <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
                          MODEL
                        </p>
                        <div className="flex flex-col gap-0.5">
                          {PROVIDER_MODELS[provider].map((opt) => {
                            const badge = MODEL_BADGES[opt.value];
                            const selected = model === opt.value;
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => {
                                  setModel(opt.value);
                                  setModelPopoverOpen(false);
                                }}
                                className={cn(
                                  "flex items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
                                  selected
                                    ? "bg-indigo-500/15 text-indigo-600 dark:bg-indigo-500/15 dark:text-[#a5b4fc]"
                                    : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-[rgba(255,255,255,0.06)]"
                                )}
                              >
                                <span>{opt.label}</span>
                                {badge && (
                                  <span
                                    className={cn(
                                      "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase",
                                      badge === "fast" &&
                                        "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400",
                                      badge === "smart" &&
                                        "bg-indigo-500/20 text-indigo-600 dark:text-indigo-400"
                                    )}
                                  >
                                    {badge}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={
                  isSubmitting ||
                  !ideaText.trim() ||
                  (mode === "evolve" && !selectedBaseProjectId)
                }
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50 disabled:hover:translate-y-0",
                  "bg-gradient-to-br from-indigo-500 to-violet-500 shadow-indigo-500/40 hover:shadow-indigo-500/50"
                )}
                style={{
                  boxShadow: "0 4px 16px rgba(99,102,241,0.4)",
                }}
                aria-label="Отправить"
              >
                {isSubmitting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <IconSend className="h-5 w-5" />
                )}
              </button>
            </div>
          </form>
          )}

          {view === "loading" && (
            <div className="flex flex-1 items-center justify-center">
              <div
                className={cn(
                  "mx-auto flex w-full max-w-[400px] flex-col items-center gap-8 rounded-[20px] p-10 shadow-lg backdrop-blur-[20px]",
                  "border bg-white/90 border-slate-200/80",
                  "dark:border-[rgba(255,255,255,0.08)] dark:bg-[rgba(255,255,255,0.04)] dark:shadow-[0_32px_80px_rgba(0,0,0,0.4)]"
                )}
              >
                <Loader2 className="h-14 w-14 animate-spin text-indigo-500 dark:text-indigo-400" />
                <p className="text-center text-lg font-medium text-slate-700 dark:text-slate-200 transition-opacity duration-300">
                  {LOADING_PHRASES[loadingPhraseIndex]}
                </p>
              </div>
            </div>
          )}

        </section>
      </div>
    </div>
  );
}
