"use client";

import { useEffect, useState } from "react";
import { Coins } from "lucide-react";

interface BillingStats {
  totalCost: number;
  totalTokens: number;
}

export default function CostBar({
  projectId,
  taskDone = 0,
  taskTotal = 0,
}: {
  projectId: string;
  taskDone?: number;
  taskTotal?: number;
}) {
  const [stats, setStats] = useState<BillingStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${projectId}/billing`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data)
          setStats({
            totalCost: data.totalCost ?? 0,
            totalTokens: data.totalTokens ?? 0,
          });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const cost = stats?.totalCost ?? 0;
  const tokens = stats?.totalTokens ?? 0;
  const formatCost = () => `$${cost.toFixed(4)}`;
  const formatTokens = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return n.toString();
  };

  return (
    <div className="ml-auto flex items-center gap-4 rounded-lg border border-[var(--pp-border)] bg-[var(--pp-surface2)]/50 px-3.5 py-2 text-xs">
      <span className="flex items-center gap-1.5 text-[var(--pp-muted)]">
        <Coins className="h-3.5 w-3.5" />
        <span className="font-mono text-[11px] font-bold text-[var(--pp-text)]">
          {formatCost()}
        </span>
      </span>
      <span className="h-3.5 w-px bg-[var(--pp-border)]" />
      <span className="text-[var(--pp-muted)]">
        Токены{" "}
        <span className="font-mono text-[11px] font-bold text-[var(--pp-text)]">
          {formatTokens(tokens)}
        </span>
      </span>
      <span className="h-3.5 w-px bg-[var(--pp-border)]" />
      <span className="text-[var(--pp-muted)]">
        Задач{" "}
        <span className="font-mono text-[11px] font-bold text-[var(--pp-text)]">
          {taskDone} / {taskTotal}
        </span>
      </span>
    </div>
  );
}
