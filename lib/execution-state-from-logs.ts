/**
 * Derives per-task execution state from console logs for the task graph.
 * Single source of truth: same ConsoleMessage[] that feeds the execution console.
 */

import type { ConsoleMessage } from "@/components/ExecutionConsole";
import type {
  ExecutionStateEntry,
  RunningNodeData,
  DoneNodeData,
  CompletedStageInfo,
} from "@/components/TaskGraph";

const STAGE_NAMES = ["generate_prompt()", "call_llm()", "write_report()", "save_files()"];

/** Format ms duration as "Xm Ys" or "Xs" */
function formatDuration(ms: number): string {
  if (ms < 0) return "—";
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** Infer current stage (0..3) from last info message content after task_started */
function inferStageFromContent(content: string): 0 | 1 | 2 | 3 | null {
  const c = content;
  if (c.includes("Generating execution plan")) return 0;
  if (c.includes("Plan generated")) return 1; // stage 0 done, now in 1
  if (c.includes("Verification phase")) return 2;
  if (c.includes("Report prepared") || c.includes("sending to QA")) return 3;
  return null;
}

export function deriveExecutionStateFromLogs(
  messages: ConsoleMessage[],
  taskIds?: string[]
): Record<string, ExecutionStateEntry> {
  const result: Record<string, ExecutionStateEntry> = {};
  const taskIdSet = taskIds ? new Set(taskIds) : null;

  // Sort by timestamp to process in order
  const sorted = [...messages].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
  );

  // Per task: start time, end time (if completed), last inferred stage
  const taskStartTime = new Map<string, number>();
  const taskEndTime = new Map<string, number>();
  const taskLastStage = new Map<string, 0 | 1 | 2 | 3>();
  const taskCompletedStages = new Map<string, CompletedStageInfo[]>();

  let currentTaskId: string | null = null;

  for (const msg of sorted) {
    const rawMeta = msg.metadata as unknown;
    const meta: { eventType?: string; data?: { taskId?: string } } | undefined =
      typeof rawMeta === "string"
        ? (() => {
            try {
              return JSON.parse(rawMeta) as { eventType?: string; data?: { taskId?: string } };
            } catch {
              return undefined;
            }
          })()
        : (rawMeta as { eventType?: string; data?: { taskId?: string } } | undefined);
    const ev = meta?.eventType;
    const data = meta?.data;
    const taskId = data?.taskId as string | undefined;
    const content = msg.content ?? "";

    if (ev === "task_started" && taskId) {
      if (taskIdSet && !taskIdSet.has(taskId)) continue;
      currentTaskId = taskId;
      taskStartTime.set(taskId, msg.timestamp.getTime());
      taskLastStage.set(taskId, 0);
      taskCompletedStages.set(taskId, []);
    } else if (
      (ev === "task_completed" || ev === "task_qa_completed") &&
      taskId
    ) {
      if (taskIdSet && !taskIdSet.has(taskId)) continue;
      taskEndTime.set(taskId, msg.timestamp.getTime());
      if (currentTaskId === taskId) currentTaskId = null;
    } else if (currentTaskId && msg.type === "log") {
      const stage = inferStageFromContent(content);
      if (stage !== null) {
        const prevStage = taskLastStage.get(currentTaskId) ?? 0;
        taskLastStage.set(currentTaskId, stage);
        const completed = taskCompletedStages.get(currentTaskId) ?? [];
        for (let i = completed.length; i < stage; i++) {
          completed.push({ name: STAGE_NAMES[i], time: undefined });
        }
        taskCompletedStages.set(currentTaskId, completed);
      }
    }
  }

  for (const [tid, startMs] of taskStartTime) {
    if (taskIdSet && !taskIdSet.has(tid)) continue;
    const endMs = taskEndTime.get(tid);
    const lastStage = taskLastStage.get(tid) ?? 0;
    const completedStages = taskCompletedStages.get(tid) ?? [];

    if (endMs != null) {
      const duration = formatDuration(endMs - startMs);
      const doneData: DoneNodeData = {
        duration,
        cost: "—",
      };
      result[tid] = { state: "done", data: doneData };
    } else {
      const runningData: RunningNodeData = {
        currentStage: lastStage as 0 | 1 | 2 | 3,
        progress: Math.min(100, Math.round((lastStage / 4) * 100)),
        completedStages,
        runningLabel: "...",
      };
      result[tid] = { state: "running", data: runningData };
    }
  }

  return result;
}
