"use client";

import { Check, X, List, GitGraph, ClipboardList, Calendar, Zap, Bug } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getExecutorDisplayLabel } from "@/lib/agent-display";
import { TaskDetailSheet, type TaskDetail } from "@/components/TaskDetailSheet";
import { TaskGraph, type ExecutionStateEntry } from "@/components/TaskGraph";
import { CopyIdButton } from "@/components/CopyIdButton";

const agentBadgeStyles: Record<string, string> = {
  TASK_EXECUTOR: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-700",
  BACKEND:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-700",
  DEVOPS: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-200 dark:border-orange-700",
  TEAMLEAD: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-200 dark:border-purple-700",
};

const statusBadgeStyles: Record<string, string> = {
  TODO: "bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-200",
  IN_PROGRESS: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-200",
  REVIEW: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-200",
  WAITING_APPROVAL: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-200",
  DONE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200",
};

const columnHeaderStyles: Record<string, { color: string; bg: string }> = {
  TODO: { color: "border-slate-400", bg: "bg-slate-50" },
  IN_PROGRESS: { color: "border-blue-400", bg: "bg-blue-50" },
  REVIEW: { color: "border-amber-400", bg: "bg-amber-50" },
  WAITING_APPROVAL: { color: "border-violet-400", bg: "bg-violet-50" },
  DONE: { color: "border-emerald-400", bg: "bg-emerald-50" },
};

function getComplexityBadge(complexity: string): { label: string; className: string } {
  const upper = complexity?.toUpperCase() || "";
  switch (upper) {
    case 'S':
      return { label: 'S', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
    case 'M':
      return { label: 'M', className: 'bg-amber-100 text-amber-700 border-amber-200' };
    case 'L':
      return { label: 'L', className: 'bg-red-100 text-red-700 border-red-200' };
    default:
      return { label: '?', className: 'bg-slate-100 text-slate-600 border-slate-200' };
  }
}

type ViewMode = "graph" | "kanban";
type FilterStatus = "ALL" | TaskDetail["status"];

const COLUMNS: Array<{ status: TaskDetail["status"]; label: string }> = [
  { status: "TODO", label: "To Do" },
  { status: "IN_PROGRESS", label: "In Progress" },
  { status: "REVIEW", label: "In Review" },
  { status: "WAITING_APPROVAL", label: "Waiting Approval" },
  { status: "DONE", label: "Done" },
  { status: "REJECTED", label: "Rejected" },
];

interface TaskListClientProps {
  tasks: TaskDetail[];
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  onTaskClick?: (taskId: string) => void;
  executionStateByTaskId?: Record<string, ExecutionStateEntry>;
  onCreateTicket?: (task: TaskDetail) => void;
}

export function TaskListClient({
  tasks,
  viewMode: controlledViewMode,
  onViewModeChange,
  onTaskClick,
  executionStateByTaskId,
  onCreateTicket,
}: TaskListClientProps) {
  const [taskItems, setTaskItems] = useState<TaskDetail[]>(tasks);

  // Keep in sync with parent when tasks update (e.g. from auto-execution stream)
  useEffect(() => {
    setTaskItems(tasks);
  }, [tasks]);

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [approvingTaskId, setApprovingTaskId] = useState<string | null>(null);
  const [uncontrolledViewMode, setUncontrolledViewMode] = useState<ViewMode>("kanban");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("ALL");

  const isControlled = controlledViewMode !== undefined;
  const viewMode = isControlled ? controlledViewMode : uncontrolledViewMode;

  const setViewMode = (mode: ViewMode) => {
    if (!isControlled) {
      setUncontrolledViewMode(mode);
    }
    onViewModeChange?.(mode);
  };

  const handleTaskClick = (taskId: string) => {
    setSelectedTaskId(taskId);
    setIsOpen(true);
    onTaskClick?.(taskId);
  };

  const handleApprove = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setApprovingTaskId(taskId);
    try {
      const response = await fetch(`/api/tasks/${taskId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved: true }),
      });
      if (!response.ok) {
        throw new Error("Failed to approve task");
      }
      const data = await response.json();
      if (data.task) {
        setTaskItems((current) =>
          current.map((task) =>
            task.id === taskId ? { ...task, status: data.task.status } : task
          )
        );
      }
    } catch (error) {
      console.error("Failed to approve task:", error);
    } finally {
      setApprovingTaskId(null);
    }
  };

  const handleReject = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setApprovingTaskId(taskId);
    try {
      const response = await fetch(`/api/tasks/${taskId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved: false }),
      });
      if (!response.ok) {
        throw new Error("Failed to reject task");
      }
      const data = await response.json();
      if (data.task) {
        setTaskItems((current) =>
          current.map((task) =>
            task.id === taskId ? { ...task, status: data.task.status } : task
          )
        );
      }
    } catch (error) {
      console.error("Failed to reject task:", error);
    } finally {
      setApprovingTaskId(null);
    }
  };

  const selectedTask = useMemo(
    () => taskItems.find((task) => task.id === selectedTaskId) ?? null,
    [selectedTaskId, taskItems]
  );

  const totalTasks = taskItems.length;
  const doneTasks = taskItems.filter((task) => task.status === "DONE").length;
  const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const statusCounts = useMemo(
    () =>
      COLUMNS.reduce(
        (acc, column) => {
          acc[column.status] = taskItems.filter((task) => task.status === column.status).length;
          return acc;
        },
        {} as Record<TaskDetail["status"], number>
      ),
    [taskItems]
  );

  const visibleTasks = useMemo(
    () =>
      filterStatus === "ALL"
        ? taskItems
        : taskItems.filter((task) => task.status === filterStatus),
    [filterStatus, taskItems]
  );

  const handleFilterChange = (next: FilterStatus) => {
    setFilterStatus(next);
  };

  const getFilterButtonClasses = (key: FilterStatus | TaskDetail["status"]) => {
    const isActive = filterStatus === key || (key === "ALL" && filterStatus === "ALL");

    const base =
      "inline-flex items-center gap-1.5 rounded-md border border-slate-800 px-3 py-1.5 text-[11px] font-semibold tracking-[0.12em] uppercase text-slate-500 transition-colors hover:text-slate-100 hover:bg-slate-900/80 hover:border-slate-700";

    if (key === "ALL") {
      return cn(
        base,
        "font-semibold",
        isActive && "bg-slate-900 text-slate-100 border-slate-700"
      );
    }

    if (key === "TODO") {
      return cn(
        base,
        "text-slate-400",
        isActive && "bg-slate-900/60 text-slate-100 border-slate-700"
      );
    }

    if (key === "IN_PROGRESS") {
      return cn(
        base,
        "text-amber-400",
        isActive && "bg-amber-500/10 border-amber-400/60 text-amber-300"
      );
    }

    if (key === "REVIEW" || key === "WAITING_APPROVAL") {
      return cn(
        base,
        "text-violet-400",
        isActive && "bg-violet-500/10 border-violet-400/60 text-violet-300"
      );
    }

    if (key === "DONE") {
      return cn(
        base,
        "text-emerald-400",
        isActive && "bg-emerald-500/10 border-emerald-400/60 text-emerald-300"
      );
    }

    return base;
  };

  const getFilterBadgeClasses = (key: FilterStatus | TaskDetail["status"]) => {
    const base =
      "inline-flex items-center rounded-[4px] bg-slate-900/80 px-1.5 py-0.5 font-mono text-[10px] leading-none text-slate-400";

    if (key === "IN_PROGRESS") {
      return cn(base, "bg-amber-500/15 text-amber-300");
    }

    if (key === "REVIEW" || key === "WAITING_APPROVAL") {
      return cn(base, "bg-violet-500/15 text-violet-300");
    }

    if (key === "DONE") {
      return cn(base, "bg-emerald-500/15 text-emerald-300");
    }

    return base;
  };

  const statusMeta: Record<
    TaskDetail["status"],
    { label: string; dotClass: string; textClass: string }
  > = {
    TODO: {
      label: "To Do",
      dotClass: "bg-slate-500",
      textClass: "text-[12px] font-semibold text-slate-400",
    },
    IN_PROGRESS: {
      label: "In Progress",
      dotClass: "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.7)]",
      textClass: "text-[12px] font-semibold text-amber-400",
    },
    REVIEW: {
      label: "In Review",
      dotClass: "bg-violet-400 shadow-[0_0_6px_rgba(167,139,250,0.7)]",
      textClass: "text-[12px] font-semibold text-violet-400",
    },
    WAITING_APPROVAL: {
      label: "Waiting Approval",
      dotClass: "bg-violet-400 shadow-[0_0_6px_rgba(167,139,250,0.7)]",
      textClass: "text-[12px] font-semibold text-violet-300",
    },
    DONE: {
      label: "Done",
      dotClass: "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]",
      textClass: "text-[12px] font-semibold text-emerald-400",
    },
    REJECTED: {
      label: "Rejected",
      dotClass: "bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.7)]",
      textClass: "text-[12px] font-semibold text-red-400",
    },
  };

  const agentPillVariants: Record<string, string> = {
    TASK_EXECUTOR: "border-blue-500/50 bg-blue-500/10 text-blue-300",
    BACKEND: "border-emerald-500/50 bg-emerald-500/10 text-emerald-300",
    DEVOPS: "border-cyan-500/50 bg-cyan-500/10 text-cyan-300",
    TEAMLEAD: "border-purple-500/50 bg-purple-500/10 text-purple-300",
  };

  return (
    <>
      {viewMode === "graph" ? (
        <div className="h-[600px] rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <ReactFlowProvider>
            <TaskGraph tasks={taskItems} onTaskClick={handleTaskClick} executionStateByTaskId={executionStateByTaskId} />
          </ReactFlowProvider>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-[0_18px_60px_rgba(15,23,42,0.35)] dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50 dark:shadow-[0_18px_60px_rgba(15,23,42,0.75)]">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-6 py-4 dark:border-slate-800 dark:bg-slate-900/60">
            <div className="flex flex-col gap-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-300">
                Task Execution
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex flex-col items-end gap-1">
                <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  {doneTasks} / {totalTasks || 0} задач
                </span>
                <div className="flex items-center gap-3">
                  <div className="h-1 w-28 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className="font-mono text-[11px] text-slate-500">
                    {progress}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 border-b border-slate-200 px-6 py-3.5 dark:border-slate-800">
            <button
              type="button"
              onClick={() => handleFilterChange("ALL")}
              className={getFilterButtonClasses("ALL")}
            >
              <span>All</span>
              <span className={getFilterBadgeClasses("ALL")}>{totalTasks}</span>
            </button>

            <div className="h-4 w-px bg-slate-200 dark:bg-slate-800" />

            {COLUMNS.map((column) => (
              <button
                key={column.status}
                type="button"
                onClick={() => handleFilterChange(column.status)}
                className={getFilterButtonClasses(column.status)}
              >
                <span>{column.label}</span>
                <span className={getFilterBadgeClasses(column.status)}>
                  {statusCounts[column.status] ?? 0}
                </span>
              </button>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-200/80 dark:border-slate-800/80">
                  <th className="px-5 py-2.5 text-left font-mono text-[10px] font-medium tracking-[0.18em] text-slate-400 dark:text-slate-500">
                    STATUS
                  </th>
                  <th className="px-5 py-2.5 text-left font-mono text-[10px] font-medium tracking-[0.18em] text-slate-400 dark:text-slate-500">
                    TASK
                  </th>
                  <th className="px-5 py-2.5 text-left font-mono text-[10px] font-medium tracking-[0.18em] text-slate-400 dark:text-slate-500">
                    AGENT
                  </th>
                  <th className="px-5 py-2.5 text-left font-mono text-[10px] font-medium tracking-[0.18em] text-slate-400 dark:text-slate-500">
                    DURATION
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleTasks.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-5 py-10 text-center font-mono text-[12px] uppercase tracking-[0.24em] text-slate-400 dark:text-slate-600"
                    >
                      — нет задач —
                    </td>
                  </tr>
                ) : (
                  visibleTasks.map((task) => {
                    const complexityBadge = getComplexityBadge(
                      task.verificationCriteria?.complexity as string
                    );
                    const meta = statusMeta[task.status];
                    const execEntry = executionStateByTaskId?.[task.id];
                    const durationStr =
                      execEntry?.state === "done"
                        ? execEntry.data.duration
                        : "—";

                    return (
                      <tr
                        key={task.id}
                        data-status={task.status}
                        className={cn(
                          "group cursor-pointer border-b border-slate-200/80 last:border-b-0 transition-colors hover:bg-slate-50 dark:border-slate-800/80 dark:hover:bg-slate-900/40",
                          selectedTaskId === task.id && "bg-slate-50 dark:bg-slate-900/60"
                        )}
                        onClick={() => handleTaskClick(task.id)}
                      >
                        <td className="px-5 py-3 align-middle">
                          <div className="flex items-center gap-2.5">
                            <span
                              className={cn(
                                "inline-flex h-2 w-2 rounded-full",
                                meta.dotClass
                              )}
                            />
                            <span className={meta.textClass}>{meta.label}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 align-middle">
                          <div className="space-y-1.5">
                            <p className="line-clamp-2 text-[13px] font-semibold text-slate-900 dark:text-slate-50">
                              {task.title}
                            </p>
                            {task.description && (
                              <p className="max-w-[340px] text-[11px] leading-relaxed text-slate-500 line-clamp-2 dark:text-slate-400">
                                {task.description}
                              </p>
                            )}
                            {(task.status === "DONE" || task.status === "REVIEW") && !!onCreateTicket && (
                              <div className="mt-2 flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onCreateTicket(task);
                                  }}
                                  title="Create Ticket"
                                  aria-label="Create Ticket"
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-slate-500 dark:hover:bg-slate-800"
                                >
                                  <Bug className="h-4 w-4" />
                                </button>
                              </div>
                            )}
                            {task.status === "WAITING_APPROVAL" && (
                              <div className="mt-2 flex gap-2 border-t border-slate-200 pt-2 dark:border-slate-800">
                                <button
                                  onClick={(e) => handleApprove(task.id, e)}
                                  disabled={approvingTaskId === task.id}
                                  className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <Check className="h-3 w-3" />
                                  Approve
                                </button>
                                <button
                                  onClick={(e) => handleReject(task.id, e)}
                                  disabled={approvingTaskId === task.id}
                                  className="flex items-center gap-1.5 rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <X className="h-3 w-3" />
                                  Reject
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3 align-middle">
                          {task.executorAgent ? (
                            <span
                              className={cn(
                                "inline-flex items-center rounded-[6px] border px-3 py-1 text-[10px] font-semibold tracking-[0.14em] uppercase",
                                agentPillVariants[task.executorAgent] ??
                                  "border-slate-600 bg-slate-900 text-slate-200"
                              )}
                            >
                              {getExecutorDisplayLabel(task.executorAgent)}
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-[6px] border border-slate-700 bg-slate-900 px-3 py-1 text-[10px] font-semibold tracking-[0.14em] uppercase text-slate-400">
                              UNASSIGNED
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3 align-middle font-mono text-[11px] text-slate-500 dark:text-slate-400">
                          {durationStr}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <TaskDetailSheet
        task={selectedTask}
        planTasks={taskItems}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onTaskUpdate={(next) => {
          setTaskItems((current) =>
            current.map((task) =>
              task.id === next.id ? { ...task, ...next } : task
            )
          );
        }}
      />
    </>
  );
}
