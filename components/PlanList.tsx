"use client";

import { useRouter } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GenerateTasksButton } from "@/components/GenerateTasksButton";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type Plan = {
  id: string;
  title: string;
  description?: string | null;
  techStack: string;
  relevanceScore?: number | null;
  tasks?: Array<{ id: string; status?: string }>;
};

function getRelevanceColor(score: number): string {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 50) return "bg-amber-500";
  return "bg-red-500";
}

function getRelevanceText(score: number): string {
  if (score >= 80) return "text-emerald-600 dark:text-emerald-300";
  if (score >= 50) return "text-amber-600 dark:text-amber-300";
  return "text-red-600 dark:text-red-300";
}

export default function PlanList({
  plans,
  projectId,
  requireApproval,
}: {
  plans: Plan[];
  projectId: string;
  requireApproval?: boolean;
}) {
  const router = useRouter();

  return (
    <section className="grid w-full gap-6 lg:grid-cols-3">
      {plans.map((plan) => (
        <Card
          key={plan.id}
          className="flex min-h-[240px] flex-col bg-white dark:border-slate-700 dark:bg-slate-900"
        >
          <CardHeader>
            <CardTitle className="text-lg text-slate-900 dark:text-slate-50">
              {plan.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-4 text-sm text-slate-600 dark:text-slate-300">
            <p>{plan.description ?? "Описание отсутствует."}</p>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Стек технологий
              </p>
              <p className="text-sm text-slate-700 dark:text-slate-200">{plan.techStack}</p>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
                <span>Релевантность</span>
                <span className={cn(getRelevanceText(plan.relevanceScore ?? 0))}>
                  {plan.relevanceScore ?? 0}%
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800/80">
                <div
                  className={cn("h-2 rounded-full transition-all duration-300", getRelevanceColor(plan.relevanceScore ?? 0))}
                  style={{ width: `${Math.min(100, Math.max(0, plan.relevanceScore ?? 0))}%` }}
                />
              </div>
            </div>
            {plan.tasks && plan.tasks.length > 0 && (
              <div>
                <div className="mb-1 flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
                  <span>Выполнение задач</span>
                  <span>
                    {plan.tasks.filter((t) => t.status === "DONE").length} / {plan.tasks.length}
                  </span>
                </div>
                <Progress
                  value={plan.tasks.length > 0 ? (plan.tasks.filter((t) => t.status === "DONE").length / plan.tasks.length) * 100 : 0}
                  className="h-2"
                />
              </div>
            )}
              <div className="mt-auto">
                {plan.tasks && plan.tasks.length > 0 ? (
                  <Button
                    size="sm"
                    className="h-9 bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600"
                    onClick={() =>
                      router.push(`/project/${projectId}/plan/${plan.id}`)
                    }
                  >
                    Открыть задачи
                  </Button>
                ) : (
                  <GenerateTasksButton planId={plan.id} projectId={projectId} />
                )}
              </div>
            </CardContent>
          </Card>
      ))}
    </section>
  );
}
