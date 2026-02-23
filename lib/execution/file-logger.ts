import { mkdirSync, appendFileSync } from "fs";
import { join } from "path";

const LOGS_DIR = "logs";

/**
 * Appends a line to the session log file in the project folder (./logs/session-{sessionId}.log).
 * Safe to call from anywhere; creates logs/ if needed.
 */
export function appendSessionLog(
  sessionId: string,
  level: "info" | "error" | "success",
  message: string
): void {
  try {
    const projectRoot = process.cwd();
    const dir = join(projectRoot, LOGS_DIR);
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, `session-${sessionId}.log`);
    const ts = new Date().toISOString();
    const line = `[${ts}] [${level.toUpperCase()}] ${message}\n`;
    appendFileSync(filePath, line, "utf-8");
  } catch (err) {
    console.error("[file-logger] Failed to append session log:", err);
  }
}

const APP_LOG_FILE = "app.log";

/**
 * Appends an INFO line to the application log (./logs/app.log).
 * Use for cross-cutting events like RAG injection.
 */
export function logInfo(message: string): void {
  try {
    const projectRoot = process.cwd();
    const dir = join(projectRoot, LOGS_DIR);
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, APP_LOG_FILE);
    const ts = new Date().toISOString();
    const line = `[${ts}] [INFO] ${message}\n`;
    appendFileSync(filePath, line, "utf-8");
  } catch (err) {
    console.error("[file-logger] Failed to append app log:", err);
  }
}
