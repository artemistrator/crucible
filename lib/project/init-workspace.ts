import { promises as fs } from "fs";
import { join, dirname } from "path";
import { getProjectDir } from "@/lib/project-workspace";

async function safeMkdir(path: string) {
  try {
    await fs.mkdir(path, { recursive: true });
  } catch {
    // ignore mkdir race conditions or permission issues here;
    // callers will fail later when trying to actually write.
  }
}

async function copyIfExists(src: string, dest: string) {
  try {
    const data = await fs.readFile(src);
    const destDir = dirname(dest);
    await safeMkdir(destDir);
    await fs.writeFile(dest, data);
  } catch {
    // If template file is missing, we silently skip it.
    // The kit download endpoint remains the source of truth.
  }
}

/**
 * Initialize on-disk workspace for a project:
 * - Ensures projects/{projectId} directory exists
 * - Writes all orchestration files under projects/{projectId}/.orchestrator/
 *   so the project root stays empty for scaffolders (create-vite, create-next-app, etc.).
 */
export async function initProjectWorkspace(projectId: string): Promise<void> {
  if (!projectId) return;

  const projectDir = getProjectDir(projectId);
  await safeMkdir(projectDir);

  const orchestratorDir = join(projectDir, ".orchestrator");
  await safeMkdir(orchestratorDir);

  const root = process.cwd();

  // 1) Core sync scripts into .orchestrator/
  const syncClientSrc = join(root, "public", "sync-client.js");
  const syncClientDest = join(orchestratorDir, "sync-client.js");
  await copyIfExists(syncClientSrc, syncClientDest);

  const syncInitSrc = join(root, "public", "sync-init.js");
  const syncInitDest = join(orchestratorDir, "sync-init.js");
  await copyIfExists(syncInitSrc, syncInitDest);

  const cursorRulesSrc = join(root, ".cursorrules");
  const cursorRulesDest = join(orchestratorDir, ".cursorrules");
  await copyIfExists(cursorRulesSrc, cursorRulesDest);

  // 2) Config file inside .orchestrator/ (script reads it via __dirname)
  const configPath = join(orchestratorDir, "config");
  await fs.writeFile(configPath, `projectId=${projectId}\n`);

  // 3) Optional .cursorfiles inside .orchestrator/
  const cursorfilesDir = join(orchestratorDir, ".cursorfiles");
  await safeMkdir(cursorfilesDir);

  // 4) README and start script inside .orchestrator/
  const readmePath = join(orchestratorDir, "README.md");
  try {
    await fs.access(readmePath);
  } catch {
    const readmeContent = `# AI Orchestrator

This folder is managed by AI Orchestrator for project \`${projectId}\`.

- \`sync-client.js\` — file sync and command runner (run from project root).
- \`config\` — projectId link to the orchestrator.

## Quick start (from project root)

\`\`\`bash
node .orchestrator/sync-client.js --auto-approve
\`\`\`

Or: \`cd .orchestrator && node sync-client.js --auto-approve\`
`;
    await fs.writeFile(readmePath, readmeContent);
  }

  const startScriptPath = join(orchestratorDir, "start.sh");
  try {
    await fs.access(startScriptPath);
  } catch {
    const startScriptContent = `#!/bin/bash
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"
if [ ! -d "node_modules" ]; then
  echo "Installing chokidar..."
  npm install chokidar
fi
echo "Starting sync client for project ${projectId}..."
node sync-client.js --auto-approve
`;
    await fs.writeFile(startScriptPath, startScriptContent);
    try {
      await fs.chmod(startScriptPath, 0o755);
    } catch {
      // ignore chmod on non-Unix
    }
  }
}

