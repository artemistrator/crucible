"use client";

import { useRef, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type PlanOption = {
  id: string;
  title: string;
  description?: string | null;
  selected: boolean;
  hasTasks?: boolean;
};

export default function PlanPillDropdown({
  plans,
  onSelect,
}: {
  plans: PlanOption[];
  onSelect?: (planId: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selectedPlan = plans.find((p) => p.selected) ?? plans[0];

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  async function handleChoose(planId: string) {
    if (planId === selectedPlan?.id) {
      setOpen(false);
      return;
    }
    try {
      const res = await fetch(`/api/plans/${planId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selected: true }),
      });
      if (!res.ok) throw new Error("Failed to select plan");
      onSelect?.(planId);
      router.refresh();
      setOpen(false);
    } catch {
      setOpen(false);
    }
  }

  if (!selectedPlan) return null;

  const pillAccent = selectedPlan.hasTasks;
  const pillClass = pillAccent
    ? "border-[var(--pp-accent)]/20 bg-[var(--pp-accent)]/10 text-[var(--pp-accent)]"
    : "border-[var(--pp-border)] bg-[var(--pp-surface2)] text-[var(--pp-muted)]";

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold transition-[transform] duration-200",
          pillClass
        )}
      >
        <span className="text-[14px]">{pillAccent ? "✓" : "○"}</span>
        <span>{selectedPlan.title}</span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 transition-transform duration-200", open && "rotate-180")}
        />
      </button>
      {open && (
        <div
          className="absolute left-0 top-[calc(100%+10px)] z-50 w-80 rounded-xl border border-[var(--pp-border)] bg-[var(--pp-surface)] p-2 shadow-[0_24px_56px_rgba(0,0,0,0.4)]"
          style={{ animation: "dropdownIn 0.18s ease-out" }}
        >
          <div className="px-2.5 pb-2 pt-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--pp-muted)]">
            Планы
          </div>
          {plans.map((plan) => {
            const itemAccent = plan.hasTasks;
            const itemSelected = plan.selected;
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => handleChoose(plan.id)}
                className={cn(
                  "flex w-full gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition-colors duration-150",
                  itemSelected && itemAccent
                    ? "bg-[var(--pp-accent)]/10 outline outline-1 outline-[var(--pp-accent)]/20"
                    : itemSelected
                      ? "bg-[var(--pp-surface2)] outline outline-1 outline-[var(--pp-border)]"
                      : "hover:bg-[var(--pp-surface2)]"
                )}
              >
                <span className="text-sm">
                  {itemSelected ? "✅" : <span className="opacity-40">○</span>}
                </span>
                <div className="min-w-0 flex-1">
                  <div
                    className={cn(
                      "text-xs font-bold",
                      itemSelected ? "text-[var(--pp-text)]" : "text-[var(--pp-muted)]"
                    )}
                  >
                    {plan.title}
                  </div>
                  {plan.description && (
                    <div className="mt-0.5 text-[11px] leading-snug text-[var(--pp-muted)] line-clamp-2">
                      {plan.description}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
