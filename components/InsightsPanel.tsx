"use client";

import { useEffect, useState } from "react";
import { Lightbulb, AlertCircle, Clock } from "lucide-react";

import { Badge } from "@/components/ui/badge";

type InsightSeverity = "low" | "medium" | "high" | null;

type InsightItem = {
  id: string;
  title: string | null;
  summary: string;
  category: string | null;
  severity: InsightSeverity;
  tags: string[];
  createdAt: string;
  planId: string | null;
  sessionId: string | null;
  recommendation: string | null;
};

interface InsightsPanelProps {
  projectId: string;
  planId?: string;
}

export function InsightsPanel({ projectId, planId }: InsightsPanelProps) {
  const [insights, setInsights] = useState<InsightItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (planId) params.set("planId", planId);
        params.set("limit", "20");

        const res = await fetch(
          `/api/projects/${encodeURIComponent(
            projectId,
          )}/insights?${params.toString()}`,
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `Failed to load insights (${res.status})`);
        }
        const data = await res.json();
        if (!cancelled) {
          setInsights((data.insights ?? []) as InsightItem[]);
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "Failed to load insights for project",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [projectId, planId]);

  const severityBadge = (severity: InsightSeverity) => {
    if (!severity) return null;
    let variantClasses =
      "border-slate-300 bg-slate-50 text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";
    if (severity === "low") {
      variantClasses =
        "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100";
    } else if (severity === "medium") {
      variantClasses =
        "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100";
    } else if (severity === "high") {
      variantClasses =
        "border-red-200 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-100";
    }
    return (
      <Badge variant="outline" className={variantClasses}>
        {severity.toUpperCase()}
      </Badge>
    );
  };

  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-amber-400" />
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
            Insights
          </span>
        </div>
      </div>

      {loading && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Loading insights...
        </p>
      )}

      {error && !loading && (
        <div className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-700 dark:border-red-700 dark:bg-red-950 dark:text-red-100">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && insights.length === 0 && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Пока нет инсайтов для этого плана. Они появятся здесь после выполнения
          сессий и анализа логов.
        </p>
      )}

      {!loading && !error && insights.length > 0 && (
        <div className="flex-1 space-y-2 overflow-y-auto pr-1 text-xs">
          {insights.map((insight) => (
            <div
              key={insight.id}
              className="rounded-md border border-slate-200 bg-white p-2.5 shadow-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <div className="mb-1 flex items-start justify-between gap-2">
                <div className="flex flex-col gap-1">
                  {insight.title && (
                    <p className="text-xs font-semibold text-slate-900 dark:text-slate-50">
                      {insight.title}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {insight.category && (
                      <Badge
                        variant="outline"
                        className="border-slate-200 bg-slate-50 text-[10px] text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      >
                        {insight.category}
                      </Badge>
                    )}
                    {severityBadge(insight.severity)}
                    {insight.tags.slice(0, 3).map((tag) => (
                      <Badge
                        key={tag}
                        variant="outline"
                        className="border-slate-200 bg-slate-50 text-[10px] text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      >
                        {tag}
                      </Badge>
                    ))}
                    {insight.tags.length > 3 && (
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">
                        +{insight.tags.length - 3}
                      </span>
                    )}
                  </div>
                </div>
                <span className="flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500">
                  <Clock className="h-3 w-3" />
                  {new Date(insight.createdAt).toLocaleDateString()}
                </span>
              </div>

              <p className="text-[11px] text-slate-800 dark:text-slate-100">
                {insight.summary}
              </p>

              {insight.recommendation && (
                <div className="mt-1.5 rounded-md bg-slate-50 p-1.5 text-[11px] text-slate-700 dark:bg-slate-950 dark:text-slate-200">
                  <span className="font-semibold text-slate-900 dark:text-slate-50">
                    Recommendation:{" "}
                  </span>
                  {insight.recommendation}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

