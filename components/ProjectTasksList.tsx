"use client";

import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getExecutorDisplayLabel } from "@/lib/agent-display";
import { GenerateTasksButton } from "@/components/GenerateTasksButton";

export type TaskItem = {
  id: string;
  title: string;
  description: string;
  status: string;
  executorAgent?: string | null;
};

const statusStyles: Record<string, string> = {
  TODO: "bg-[rgba(107,115,148,0.12)] text-[#6b7394]",
  IN_PROGRESS: "bg-[rgba(96,165,250,0.12)] text-[#60a5fa]",
  REVIEW: "bg-[rgba(96,165,250,0.12)] text-[#60a5fa]",
  WAITING_APPROVAL: "bg-[rgba(248,113,113,0.12)] text-[#f87171]",
  DONE: "bg-[rgba(74,222,128,0.12)] text-[#4ade80]",
};

const statusLabels: Record<string, string> = {
  TODO: "TO DO",
  IN_PROGRESS: "In Progress",
  REVIEW: "Review",
  WAITING_APPROVAL: "Waiting",
  DONE: "Done",
};

function formatTaskNum(index: number) {
  return `#${String(index + 1).padStart(3, "0")}`;
}

export default function ProjectTasksList({
  projectId,
  planId,
  tasks,
  requireApproval,
}: {
  projectId: string;
  planId: string | null;
  tasks: TaskItem[];
  requireApproval?: boolean;
}) {
  const router = useRouter();
  const doneCount = tasks.filter((t) => t.status === "DONE").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#6b7394]">
          ЗАДАЧИ{" "}
          <span className="text-xs font-normal">
            {doneCount} из {tasks.length} выполнено
          </span>
        </p>
        <Button
          size="sm"
          className="rounded-md bg-[#4ade80] px-4 py-1.5 font-bold text-[#0a1a0f] hover:bg-[#4ade80]/90"
          onClick={() => router.push(`/project/${projectId}/plan/${planId}`)}
        >
          <Plus className="mr-2 h-4 w-4" />
          Задача
        </Button>
      </div>
      {tasks.length === 0 && planId ? (
        <div className="rounded-lg border border-dashed border-[#252a3a] py-8 text-center">
          <p className="text-sm text-[#6b7394]">Задач пока нет</p>
          <div className="mt-3">
            <GenerateTasksButton planId={planId} projectId={projectId} />
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((task, index) => (
            <button
              key={task.id}
              type="button"
              onClick={() =>
                planId && router.push(`/project/${projectId}/plan/${planId}`)
              }
              className="flex w-full cursor-pointer items-start gap-3.5 rounded-lg border border-[#252a3a] bg-[#151820] px-4 py-3.5 transition-colors duration-150 hover:border-[rgba(96,165,250,0.35)] hover:bg-[#171c28]"
            >
              <span className="min-w-[36px] font-mono text-[11px] text-[#6b7394]">
                {formatTaskNum(index)}
              </span>
              <div className="min-w-0 flex-1 text-left">
                <div className="text-[13px] font-semibold text-[#e8eaf0]">
                  {task.title}
                </div>
                <div className="mt-0.5 text-xs leading-snug text-[#6b7394]">
                  {task.description}
                </div>
                {task.executorAgent && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="rounded border border-[#252a3a] bg-[#1c2030] px-1.5 py-0.5 text-[10px] font-semibold text-[#6b7394]">
                      {getExecutorDisplayLabel(task.executorAgent)}
                    </span>
                  </div>
                )}
              </div>
              <span
                className={cn(
                  "mt-0.5 rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wider",
                  statusStyles[task.status] ?? statusStyles.TODO
                )}
              >
                {statusLabels[task.status] ?? task.status}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
