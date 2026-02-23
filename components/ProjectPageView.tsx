"use client";

import { useRouter } from "next/navigation";
import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { MoreHorizontal, ChevronRight, Plus, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GenerateTasksButton } from "@/components/GenerateTasksButton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import { ProjectContextSheet } from "@/components/ProjectContextSheet";
import { ExportButton } from "@/components/ExportButton";
import PlanPageClient from "@/components/PlanPageClient";
import type { TaskDetail } from "@/components/TaskDetailSheet";
import { cn } from "@/lib/utils";

export type PlanForView = {
  id: string;
  title: string;
  description?: string | null;
  techStack: string;
  relevanceScore?: number | null;
  selected: boolean;
  estimatedComplexity?: string | null;
  estimatedTime?: string | null;
  pros: string[];
  cons: string[];
  tasks: Array<{
    id: string;
    title: string;
    description: string;
    status: string;
    executorAgent?: string | null;
  }>;
};

export type ProjectPageViewProps = {
  projectId: string;
  ideaText: string;
  status: string;
  context: string;
  githubRepo: string | null;
  requireApproval: boolean;
  plans: PlanForView[];
  initialView?: "plans" | "tasks";
};

const GENERATE_DELAY_MS = 700;

export default function ProjectPageView({
  projectId,
  ideaText,
  status,
  context,
  githubRepo,
  requireApproval,
  plans,
  initialView = "plans",
}: ProjectPageViewProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [contextOpen, setContextOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(() =>
    plans.find((p) => p.selected)?.id ?? plans[0]?.id ?? null
  );
  const [canvasView, setCanvasView] = useState<"plans" | "tasks">(initialView);
  /** When on tasks view: 'plans' = show plans (translate 0), 'tasks' = show tasks (-100vh). Used for slide animation. */
  const [slidePosition, setSlidePosition] = useState<"plans" | "tasks">(initialView === "tasks" ? "tasks" : "plans");
  const [generating, setGenerating] = useState(false);
  const [fullPlanByPlanId, setFullPlanByPlanId] = useState<Record<string, {
    tasks: TaskDetail[];
    aiProvider: string | null;
    aiModel: string | null;
  }>>({});
  const [fullPlanLoading, setFullPlanLoading] = useState(false);
  const [fullPlanError, setFullPlanError] = useState<string | null>(null);

  useEffect(() => {
    setCanvasView(initialView);
    setSlidePosition(initialView === "tasks" ? "tasks" : "plans");
  }, [initialView]);

  // When switching to tasks view: first paint plans, then animate slide up to tasks
  useEffect(() => {
    if (canvasView !== "tasks") return;
    if (slidePosition === "tasks") return;
    const id = requestAnimationFrame(() => setSlidePosition("tasks"));
    return () => cancelAnimationFrame(id);
  }, [canvasView, slidePosition]);

  // Preload: when a plan with tasks is selected, fetch full data in background so "Перейти в задачи" is instant
  useEffect(() => {
    const hasTasks = (plans.find((p) => p.id === selectedPlanId)?.tasks?.length ?? 0) > 0;
    if (!selectedPlanId || !hasTasks) return;
    if (fullPlanByPlanId[selectedPlanId]) return;
    let cancelled = false;
    fetch(`/api/plans/${selectedPlanId}/full`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load plan");
        return res.json();
      })
      .then((data) => {
        if (!cancelled && data.tasks) {
          setFullPlanByPlanId((prev) => ({
            ...prev,
            [selectedPlanId]: {
              tasks: data.tasks,
              aiProvider: data.plan?.aiProvider ?? null,
              aiModel: data.plan?.aiModel ?? null,
            },
          }));
        }
      })
      .catch(() => { /* ignore prefetch errors */ });
    return () => { cancelled = true; };
  }, [selectedPlanId, plans, fullPlanByPlanId]);

  // When in tasks view, ensure we have full plan data (fetch if not prefetched)
  useEffect(() => {
    if (canvasView !== "tasks" || !selectedPlanId) return;
    if (fullPlanByPlanId[selectedPlanId]) {
      setFullPlanError(null);
      setFullPlanLoading(false);
      return;
    }
    let cancelled = false;
    setFullPlanLoading(true);
    setFullPlanError(null);
    fetch(`/api/plans/${selectedPlanId}/full`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load plan");
        return res.json();
      })
      .then((data) => {
        if (!cancelled && data.tasks) {
          setFullPlanByPlanId((prev) => ({
            ...prev,
            [selectedPlanId]: {
              tasks: data.tasks,
              aiProvider: data.plan?.aiProvider ?? null,
              aiModel: data.plan?.aiModel ?? null,
            },
          }));
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setFullPlanError(err instanceof Error ? err.message : "Ошибка загрузки");
        }
      })
      .finally(() => {
        if (!cancelled) setFullPlanLoading(false);
      });
    return () => { cancelled = true; };
  }, [canvasView, selectedPlanId, fullPlanByPlanId]);

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) ?? plans[0] ?? null;

  // Stable order: keep plan order from first load so cards don't "jump" when selection changes
  const planOrderRef = useRef<string[]>(null);
  if (planOrderRef.current === null && plans.length > 0) {
    planOrderRef.current = plans.map((p) => p.id);
  }
  const plansStableOrder = useMemo(() => {
    const order = planOrderRef.current ?? plans.map((p) => p.id);
    return order
      .map((id) => plans.find((p) => p.id === id))
      .filter(Boolean) as PlanForView[];
  }, [plans]);

  const handleSelectPlan = useCallback(
    async (planId: string) => {
      if (planId === selectedPlanId) return;
      try {
        const res = await fetch(`/api/plans/${planId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ selected: true }),
        });
        if (!res.ok) throw new Error("Failed to select plan");
        setSelectedPlanId(planId);
        router.refresh();
      } catch {
        toast({ variant: "destructive", title: "Не удалось выбрать план" });
      }
    },
    [selectedPlanId, router, toast]
  );

  const handleGenerated = useCallback(() => {
    if (!selectedPlanId) return;
    setTimeout(() => {
      setGenerating(false);
      setCanvasView("tasks");
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", `/project/${projectId}/plan/${selectedPlanId}`);
      }
      router.refresh();
    }, GENERATE_DELAY_MS);
  }, [projectId, selectedPlanId, router]);

  const goToPlans = useCallback(() => {
    setSlidePosition("plans");
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `/project/${projectId}`);
    }
    // Switch to plans view after slide animation (500ms) so content actually changes
    const t = setTimeout(() => setCanvasView("plans"), 500);
    return () => clearTimeout(t);
  }, [projectId]);

  const isPlanSelected = !!selectedPlanId;
  const selectedPlanHasTasks = (selectedPlan?.tasks?.length ?? 0) > 0;

  const plansSectionContent = (
    <>
      {generating && (
        <div
          className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[var(--pp-bg)]/90 backdrop-blur-sm"
          aria-hidden
        >
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--pp-border)] border-t-[var(--pp-accent)]" />
          <p className="mt-4 text-sm font-medium text-[var(--pp-text)]">Генерация задач…</p>
          <p className="mt-1 text-xs text-[var(--pp-muted)]">через момент откроется блок с задачами</p>
        </div>
      )}
      {/* Header: fixed, no scroll */}
      <div className="flex-shrink-0 px-8 pt-5">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--pp-muted)]">
          {"// ИДЕЯ ПРОЕКТА"}
        </p>
        <div className="flex items-start justify-between gap-4">
          <h1 className="max-w-[620px] text-xl font-extrabold leading-tight text-[var(--pp-text)]">
            {ideaText}
          </h1>
          <div className="flex items-center gap-2">
            <ExportButton
              projectId={projectId}
              projectName={ideaText.slice(0, 30)}
              status={status}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 border border-[var(--pp-border)] bg-transparent px-3.5 text-[var(--pp-muted)] hover:bg-[var(--pp-surface2)] hover:text-[var(--pp-text)]"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[160px]">
                <DropdownMenuItem onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(projectId);
                    toast({ title: "Скопировано", description: "ID проекта в буфере обмена" });
                  } catch {
                    toast({ variant: "destructive", title: "Не удалось скопировать" });
                  }
                }}>
                  Копировать ID проекта
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Scrollable: cards + actions */}
      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        <div className="mt-8 grid w-full gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {plansStableOrder.map((plan, index) => {
            const isSelected = plan.id === selectedPlanId;
            const taskCount = plan.tasks?.length ?? 0;
            const stackItems = plan.techStack
              ? plan.techStack.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
              : [];
            const pros = plan.pros ?? [];
            const cons = plan.cons ?? [];
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => handleSelectPlan(plan.id)}
                className={cn(
                  "flex flex-col rounded-xl border-2 bg-[var(--pp-bg)] p-5 text-left transition-all duration-200",
                  isSelected
                    ? "border-[var(--pp-accent)] bg-[var(--pp-accent)]/5 shadow-[0_0_0_1px_var(--pp-accent)]"
                    : "border-[var(--pp-border)] hover:border-[var(--pp-muted)]/50 hover:bg-[var(--pp-surface2)]/50"
                )}
              >
                <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--pp-muted)]">
                  {"// "}{String(index + 1).padStart(2, "0")}
                </p>
                <h3 className="mb-2 text-base font-bold text-[var(--pp-text)]">{plan.title}</h3>
                {stackItems.length > 0 ? (
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {stackItems.map((item, i) => (
                      <span
                        key={i}
                        className="rounded-md bg-[var(--pp-surface2)] px-2 py-0.5 font-mono text-[11px] text-[var(--pp-text)]"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mb-3 text-xs text-[var(--pp-muted)]">{plan.techStack || "—"}</p>
                )}
                <p className="mb-3 line-clamp-5 flex-1 min-h-0 text-sm leading-snug text-[var(--pp-muted)]">
                  {plan.description ?? "Без описания"}
                </p>
                {(plan.estimatedComplexity != null || plan.estimatedTime) && (
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] text-[var(--pp-muted)]">
                    {plan.estimatedComplexity != null && (
                      <span className="rounded bg-[var(--pp-surface2)] px-1.5 py-0.5 font-medium">
                        Сложность: {plan.estimatedComplexity}/5
                      </span>
                    )}
                    {plan.estimatedTime && (
                      <span title="Оценка с учётом разработки с LLM">
                        {plan.estimatedTime}
                      </span>
                    )}
                  </div>
                )}
                {(pros.length > 0 || cons.length > 0) && (
                  <div className="mb-3 space-y-1.5 text-xs">
                    {pros.slice(0, 3).map((text, i) => (
                      <div key={`pro-${i}`} className="flex items-start gap-2 text-[var(--pp-muted)]">
                        <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-600 dark:bg-emerald-500/30 dark:text-emerald-400">
                          <Plus className="h-2.5 w-2.5" strokeWidth={2.5} />
                        </span>
                        <span className="line-clamp-2">{text}</span>
                      </div>
                    ))}
                    {cons.slice(0, 2).map((text, i) => (
                      <div key={`con-${i}`} className="flex items-start gap-2 text-[var(--pp-muted)]">
                        <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-red-500/20 text-red-600 dark:bg-red-500/30 dark:text-red-400">
                          <Minus className="h-2.5 w-2.5" strokeWidth={2.5} />
                        </span>
                        <span className="line-clamp-2">{text}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-auto flex items-center justify-between text-[11px] text-[var(--pp-muted)]">
                  <span>{taskCount === 0 ? "0 задач" : `${taskCount} ${taskCount === 1 ? "задача" : "задачи"}`}</span>
                  <span className="font-mono">—</span>
                </div>
              </button>
            );
          })}
        </div>
        <div className="mt-8 flex flex-col items-end gap-2">
          {selectedPlanId && (
            selectedPlanHasTasks ? (
              <Button
                size="sm"
                className="h-9 bg-[var(--pp-accent)] text-[var(--pp-bg)] hover:opacity-90"
                onClick={() => {
                  setCanvasView("tasks");
                  if (typeof window !== "undefined") {
                    window.history.replaceState(null, "", `/project/${projectId}/plan/${selectedPlanId}`);
                  }
                }}
              >
                Перейти в задачи
                <ChevronRight className="ml-1.5 h-4 w-4" />
              </Button>
            ) : (
              <GenerateTasksButton
                planId={selectedPlanId}
                projectId={projectId}
                label="Генерировать задачи →"
                onGenerated={handleGenerated}
                onGenerateStart={() => setGenerating(true)}
                disabled={!isPlanSelected}
                isGenerating={generating}
              />
            )
          )}
        </div>
      </div>
    </>
  );

  return (
    <div className="project-page flex flex-1 flex-col min-h-0 bg-[var(--pp-bg)] text-[var(--pp-text)]">
      {/* Outer: exactly 100vh, nothing bleeds through */}
      <div className="scroll-container flex-1 min-h-0 h-screen max-h-full overflow-hidden">
        {/* When only plans: no tasks section in DOM, single full-height screen */}
        {canvasView === "plans" ? (
          <section className="plans-view screen relative flex h-screen min-h-0 flex-shrink-0 flex-col overflow-hidden border-b border-[var(--pp-border)] bg-[var(--pp-surface)]">
            {plansSectionContent}
          </section>
        ) : (
          /* ========== Wrapper with both screens: slide animation ========== */
          <div
            className={cn(
              "screens-wrapper h-[200vh] w-full transition-transform duration-500 ease-out",
              slidePosition === "tasks" && "-translate-y-[100vh]"
            )}
          >
            {/* Screen 1: Plan selection — exactly 100vh */}
            <section className="plans-view screen relative flex h-screen min-h-0 flex-shrink-0 flex-col overflow-hidden border-b border-[var(--pp-border)] bg-[var(--pp-surface)]">
              {plansSectionContent}
            </section>

          {/* Screen 2: Task execution — exactly 100vh, slides up to replace Screen 1 */}
          <section className="tasks-view screen flex h-screen min-h-0 flex-shrink-0 flex-col overflow-hidden bg-[var(--pp-bg)]">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {fullPlanLoading && (
                <div className="flex h-full items-center justify-center bg-[var(--pp-bg)]">
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--pp-border)] border-t-[var(--pp-accent)]" />
                    <span className="text-sm text-[var(--pp-muted)]">Загрузка плана…</span>
                  </div>
                </div>
              )}
              {fullPlanError && !fullPlanLoading && (
                <div className="flex h-full items-center justify-center text-[var(--pp-danger)]">
                  {fullPlanError}
                </div>
              )}
              {fullPlanByPlanId[selectedPlanId!] && selectedPlanId && !fullPlanLoading && (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  <PlanPageClient
                    projectId={projectId}
                    planId={selectedPlanId}
                    tasks={fullPlanByPlanId[selectedPlanId].tasks}
                    aiProvider={fullPlanByPlanId[selectedPlanId].aiProvider}
                    aiModel={fullPlanByPlanId[selectedPlanId].aiModel}
                    onBackToPlans={goToPlans}
                    embeddedInCanvas
                  />
                </div>
              )}
            </div>
          </section>
          </div>
        )}
      </div>

      <ProjectContextSheet
        projectId={projectId}
        initialContext={context}
        initialGithubRepo={githubRepo}
        initialRequireApproval={requireApproval}
        open={contextOpen}
        onOpenChange={setContextOpen}
      />
    </div>
  );
}
