"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { getExecutorDisplayLabel } from "@/lib/agent-display";
import type { TaskDetail } from "./TaskDetailSheet";

interface TimelineViewProps {
  tasks: TaskDetail[];
  onTaskClick?: (taskId: string) => void;
  selectedTaskId?: string | null;
}

const taskStatusStyles: Record<TaskDetail["status"], string> = {
  TODO: "bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200",
  IN_PROGRESS: "bg-blue-50 border-blue-400 text-blue-700 dark:bg-blue-950 dark:border-blue-700 dark:text-blue-200 animate-pulse",
  REVIEW: "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950 dark:border-amber-700 dark:text-amber-200",
  WAITING_APPROVAL: "bg-violet-50 border-violet-200 text-violet-700 dark:bg-violet-950 dark:border-violet-700 dark:text-violet-200",
  DONE: "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950 dark:border-emerald-700 dark:text-emerald-200",
  REJECTED: "bg-red-50 border-red-200 text-red-700 dark:bg-red-950 dark:border-red-700 dark:text-red-200",
};

const taskStatusLabels: Record<TaskDetail["status"], string> = {
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  REVIEW: "In Review",
  WAITING_APPROVAL: "Waiting Approval",
  DONE: "Done",
  REJECTED: "Rejected",
};

export function TimelineView({ tasks, onTaskClick, selectedTaskId }: TimelineViewProps) {
  const sortedTasks = useMemo(() => {
    return [...tasks];
  }, [tasks]);

  if (sortedTasks.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-slate-500 dark:text-slate-400">
        <p className="text-sm">Нет задач для отображения</p>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex-shrink-0 border-b border-slate-200 px-3 py-3 dark:border-slate-800">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
          Timeline View
        </p>
      </div>
      
      <div className="flex-1 overflow-x-auto overflow-y-auto p-4">
        <div className="flex min-w-max gap-3">
          {sortedTasks.map((task, index) => (
            <div
              key={task.id}
              onClick={() => onTaskClick?.(task.id)}
              className={cn(
                "relative flex min-w-[280px] max-w-[320px] cursor-pointer flex-col gap-2 rounded-lg border-2 p-4 transition-all hover:shadow-lg",
                taskStatusStyles[task.status],
                task.status === "IN_PROGRESS" &&
                  "border-blue-500 ring-4 ring-blue-100 dark:border-blue-400 dark:ring-blue-900",
                selectedTaskId === task.id && "ring-2 ring-offset-2 ring-blue-500 dark:ring-blue-400"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                  {index + 1}
                </span>
                <div className="flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                  {taskStatusLabels[task.status]}
                </div>
              </div>
              
              <div className="flex flex-col gap-1">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-50 line-clamp-2">
                  {task.title}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-3">
                  {task.description}
                </p>
              </div>

              {task.executorAgent && (
                <div className="mt-2 pt-2 border-t border-current/20">
                  <span className="text-[10px] font-medium uppercase tracking-wide opacity-75">
                    {getExecutorDisplayLabel(task.executorAgent)}
                  </span>
                </div>
              )}

              {index < sortedTasks.length - 1 && (
                <div className="absolute -right-3 top-1/2 h-0.5 w-3 bg-slate-300 dark:bg-slate-600" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
