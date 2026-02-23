"use client";

import { useCallback, useEffect, useState } from "react";
import { DollarSign, Loader2, Cpu, Zap } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface GlobalBilling {
  totalCost: number;
  totalCalls: number;
}

interface BillingBreakdown {
  totalCost: number;
  totalCalls: number;
  byModel: Array<{ model: string; cost: number; calls: number }>;
  byActionType: Array<{ actionType: string; cost: number; calls: number }>;
}

type ViewMode = "models" | "actions";

const formatCost = (n: number) => `$${n.toFixed(4)}`;

export function GlobalBillingIndicator() {
  const [billing, setBilling] = useState<GlobalBilling | null>(null);
  const [breakdown, setBreakdown] = useState<BillingBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<ViewMode>("models");

  const loadBilling = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/billing");
      if (!response.ok) throw new Error("Failed to fetch billing");
      const data = await response.json();
      setBilling(data);
    } catch (error) {
      console.error("[billing:header]", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadBreakdown = useCallback(async () => {
    if (breakdown) return;
    try {
      setBreakdownLoading(true);
      const response = await fetch("/api/billing?breakdown=true");
      if (!response.ok) throw new Error("Failed to fetch breakdown");
      const data = await response.json();
      setBreakdown(data);
    } catch (error) {
      console.error("[billing:breakdown]", error);
    } finally {
      setBreakdownLoading(false);
    }
  }, [breakdown]);

  useEffect(() => {
    loadBilling();
  }, [loadBilling]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) loadBreakdown();
  };

  if (loading || !billing) {
    return null;
  }

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex cursor-pointer items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800 transition-colors hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200 dark:hover:bg-emerald-500/20"
          aria-label="Показать детали затрат"
        >
          <DollarSign className="h-3 w-3 shrink-0" />
          <span>Total: {formatCost(billing.totalCost)}</span>
          <span className="text-[10px] text-emerald-700/80 dark:text-emerald-300/80">
            ({billing.totalCalls} calls)
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        side="bottom"
        sideOffset={10}
        className="w-[320px] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border-0 bg-transparent p-0 shadow-none"
      >
        <div
          className="overflow-hidden rounded-2xl bg-gradient-to-br from-white/85 to-white/70 backdrop-blur-2xl backdrop-saturate-150 dark:from-slate-800/85 dark:to-slate-900/75"
          style={{
            boxShadow:
              "0 0 0 1px rgba(255,255,255,0.5) inset, 0 25px 50px -12px rgba(0,0,0,0.12)",
          }}
        >
          {/* Header */}
          <div className="border-b border-slate-200/60 px-4 py-3 dark:border-slate-600/40">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 dark:bg-emerald-400/15">
                  <DollarSign className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-900 dark:text-slate-50">
                    {formatCost(billing.totalCost)} · {billing.totalCalls} вызовов
                  </p>
                </div>
              </div>
              {/* Toggles */}
              <div className="flex rounded-lg bg-slate-200/60 p-0.5 dark:bg-slate-700/50">
                <button
                  type="button"
                  onClick={() => setView("models")}
                  className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
                    view === "models"
                      ? "bg-white text-slate-900 shadow-sm dark:bg-slate-600 dark:text-slate-50"
                      : "text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                  title="По моделям"
                >
                  <Cpu className="h-3 w-3" />
                  Модели
                </button>
                <button
                  type="button"
                  onClick={() => setView("actions")}
                  className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
                    view === "actions"
                      ? "bg-white text-slate-900 shadow-sm dark:bg-slate-600 dark:text-slate-50"
                      : "text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                  title="По типам вызовов"
                >
                  <Zap className="h-3 w-3" />
                  Вызовы
                </button>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="px-4 py-3">
            {breakdownLoading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-slate-500 dark:text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-xs">Загрузка…</span>
              </div>
            ) : breakdown ? (
              <>
                {view === "models" && (
                  <ul className="space-y-0.5">
                    {[...breakdown.byModel]
                      .sort((a, b) => b.cost - a.cost)
                      .map((m) => (
                        <li
                          key={m.model}
                          className="flex items-center justify-between gap-2 px-2 py-1 text-xs"
                        >
                          <span
                            className="min-w-0 truncate font-medium text-slate-800 dark:text-slate-200"
                            title={m.model}
                          >
                            {m.model}
                          </span>
                          <span className="shrink-0 tabular-nums font-medium text-emerald-600 dark:text-emerald-400">
                            {formatCost(m.cost)}
                            <span className="ml-1 font-normal text-slate-500 dark:text-slate-400">
                              ({m.calls})
                            </span>
                          </span>
                        </li>
                      ))}
                  </ul>
                )}
                {view === "actions" && (
                  <ul className="space-y-0.5">
                    {[...breakdown.byActionType]
                      .sort((a, b) => b.cost - a.cost)
                      .map((a) => (
                        <li
                          key={a.actionType}
                          className="flex items-center justify-between gap-2 px-2 py-1 text-xs"
                        >
                          <span
                            className="min-w-0 truncate font-medium text-slate-800 dark:text-slate-200"
                            title={a.actionType}
                          >
                            {a.actionType}
                          </span>
                          <span className="shrink-0 tabular-nums font-medium text-emerald-600 dark:text-emerald-400">
                            {formatCost(a.cost)}
                            <span className="ml-1 font-normal text-slate-500 dark:text-slate-400">
                              ({a.calls})
                            </span>
                          </span>
                        </li>
                      ))}
                  </ul>
                )}
                {((view === "models" && breakdown.byModel.length === 0) ||
                  (view === "actions" && breakdown.byActionType.length === 0)) && (
                  <p className="py-4 text-center text-xs text-slate-500 dark:text-slate-400">
                    Нет данных
                  </p>
                )}
              </>
            ) : (
              <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                Ошибка загрузки
              </p>
            )}
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
