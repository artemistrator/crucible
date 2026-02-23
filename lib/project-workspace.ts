import { join } from "path";

/**
 * Returns the absolute path to a project's workspace directory.
 * Used by Files API, cloud writeFile, and cloud executeCommand.
 * - Locally: ./projects/{projectId} relative to process.cwd()
 * - In Docker: /app/projects/{projectId} when process.cwd() is /app
 */
export function getProjectDir(projectId: string): string {
  const root = process.env.PROJECTS_ROOT || process.cwd();
  return join(root, "projects", projectId);
}
