import { spawn, type ChildProcess } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { getProjectDir } from "@/lib/project-workspace";

type RunnerMode = "local" | "cloud";

const processes = new Map<string, ChildProcess>();

function getBaseUrl() {
  // Use INTERNAL_APP_URL when available, otherwise fall back to localhost:PORT
  return process.env.INTERNAL_APP_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
}

/**
 * Ensure that a sync-client process is running for the given project.
 * - Only used in dev/cloud execution mode.
 * - Idempotent per-process: if already running, does nothing.
 */
export function ensureSyncClientRunning(
  projectId: string,
  mode: RunnerMode = "cloud"
): void {
  if (!projectId) return;

  // Only auto-run in cloud mode; for local mode we expect user to run sync-client manually
  if (mode !== "cloud") return;

  const flag = process.env.SYNC_CLIENT_AUTOSTART?.toLowerCase();
  const defaultAutostart = process.env.NODE_ENV !== "production";
  const shouldAutostart =
    flag === "true" || (flag === undefined && defaultAutostart);

  if (!shouldAutostart) {
    return;
  }

  if (processes.has(projectId)) {
    const existing = processes.get(projectId)!;
    if (!existing.killed) {
      return;
    }
    processes.delete(projectId);
  }

  const projectDir = getProjectDir(projectId);
  const syncClientPath = join(projectDir, ".orchestrator", "sync-client.js");
  const baseUrl = getBaseUrl();
  const apiUrl = `${baseUrl}/api/sync`;

  // #region agent log
  fetch("http://127.0.0.1:7244/ingest/6dfd3143-9408-4773-bf60-de78980b8261", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "db318d" },
    body: JSON.stringify({
      sessionId: "db318d",
      hypothesisId: "H3",
      location: "sync-client-runner.ts",
      message: "spawn sync-client",
      data: { projectId, syncClientPath, projectDir, syncClientExists: existsSync(syncClientPath) },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  try {
    const child = spawn(
      process.execPath, // node binary
      [syncClientPath, "--url", apiUrl, "--project-id", projectId, "--auto-approve"],
      {
        cwd: projectDir,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          // Make it explicit for logs where this runs
          ORCHESTRATOR_SYNC_PROJECT_ID: projectId,
        },
      }
    );

    processes.set(projectId, child);

    child.stdout.on("data", (chunk) => {
      console.log(`[sync-client:${projectId}] ${chunk.toString().trimEnd()}`);
    });
    child.stderr.on("data", (chunk) => {
      console.warn(`[sync-client:${projectId}:stderr] ${chunk.toString().trimEnd()}`);
    });
    child.on("exit", (code, signal) => {
      console.log(
        `[sync-client:${projectId}] exited with code=${code} signal=${signal ?? "none"}`
      );
      processes.delete(projectId);
    });
  } catch (error) {
    console.error(
      `[sync-client-runner] Failed to start sync-client for project ${projectId}:`,
      error
    );
  }
}

