/**
 * Display labels for executor/agent roles (UI only).
 * Backend still uses TASK_EXECUTOR, BACKEND, DEVOPS, etc.
 */
export const EXECUTOR_DISPLAY_LABELS: Record<string, string> = {
  TASK_EXECUTOR: "Frontend",
  BACKEND: "Backend",
  DEVOPS: "DevOps",
  TEAMLEAD: "Teamlead",
  CURSOR: "Cursor",
  QA: "QA",
  CSS: "CSS",
};

export function getExecutorDisplayLabel(role: string | null | undefined): string {
  if (role == null || role === "") return "";
  return EXECUTOR_DISPLAY_LABELS[role] ?? role;
}
