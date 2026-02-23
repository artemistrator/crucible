"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Lightbulb, ListChecks } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

type InsightItem = {
  id: string;
  title: string | null;
  summary: string;
  category: string | null;
  severity: string | null;
  tags: string[];
  createdAt: string;
  recommendation: string | null;
};

interface SessionSummaryModalProps {
  projectId: string;
  sessionId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SessionSummaryModal({
  projectId,
  sessionId,
  open,
  onOpenChange,
}: SessionSummaryModalProps) {
  const [insights, setInsights] = useState<InsightItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !sessionId) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("sessionId", sessionId);
        params.set("limit", "5");
        const res = await fetch(
          `/api/projects/${encodeURIComponent(
            projectId,
          )}/insights?${params.toString()}`,
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setInsights((data.insights ?? []) as InsightItem[]);
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
  }, [open, projectId, sessionId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl border-slate-200 bg-white text-slate-900 shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base text-slate-900 dark:text-slate-50">
            <CheckCircle2 className="h-5 w-5 text-emerald-500 dark:text-emerald-400" />
            Session Summary
          </DialogTitle>
        </DialogHeader>

        <div className="mt-2 space-y-4 text-sm">
          <p className="text-slate-600 dark:text-slate-300">
            Сессия завершена. Ниже — ключевые инсайты, которые могут помочь
            улучшить следующие запуски.
          </p>

          {loading ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Loading insights...
            </p>
          ) : insights.length === 0 ? (
            <div className="flex items-center gap-2 rounded-md border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
              <ListChecks className="h-4 w-4" />
              Для этой сессии инсайтов не найдено — вероятно, всё прошло гладко.
            </div>
          ) : (
            <div className="space-y-3">
              {insights.map((insight) => (
                <div
                  key={insight.id}
                  className="rounded-md border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Lightbulb className="h-4 w-4 text-amber-400" />
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                        {insight.title || "Insight"}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {insight.category && (
                        <Badge variant="outline" className="text-[10px]">
                          {insight.category}
                        </Badge>
                      )}
                      {insight.severity && (
                        <Badge variant="outline" className="text-[10px]">
                          {insight.severity.toUpperCase()}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-slate-800 dark:text-slate-100">
                    {insight.summary}
                  </p>
                  {insight.recommendation && (
                    <p className="mt-1 text-xs text-slate-700 dark:text-slate-200">
                      <span className="font-semibold">Recommendation: </span>
                      {insight.recommendation}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button
              size="sm"
              onClick={() => onOpenChange(false)}
              className="bg-slate-900 text-slate-50 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
            >
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

