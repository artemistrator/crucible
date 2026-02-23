import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import { join } from "path";
import AdmZip from "adm-zip";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");

    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }

    const zip = new AdmZip();

    // Read the updated sync-client.js from filesystem
    const syncClientPath = join(process.cwd(), "public", "sync-client.js");
    const syncClientContent = await fs.readFile(syncClientPath, "utf-8");
    zip.addFile("sync-client.js", Buffer.from(syncClientContent));

    // Read sync-init.js from filesystem
    const syncInitPath = join(process.cwd(), "public", "sync-init.js");
    const syncInitContent = await fs.readFile(syncInitPath, "utf-8");
    zip.addFile("sync-init.js", Buffer.from(syncInitContent));

    // Read the updated .cursorrules from filesystem
    const cursorrulesPath = join(process.cwd(), ".cursorrules");
    const cursorrulesContent = await fs.readFile(cursorrulesPath, "utf-8");
    zip.addFile(".cursorrules", Buffer.from(cursorrulesContent));

    // Read start.sh template
    const startScriptContent = `#!/bin/bash

# Install dependencies
if [ ! -d "node_modules" ]; then
  echo "Installing chokidar..."
  npm install chokidar
fi

# Start sync client (host talks to docker app on port 3002)
echo "Starting sync client (default API URL http://localhost:3002/api/sync)..."
node sync-client.js
`;
    zip.addFile("start.sh", Buffer.from(startScriptContent));

    // Orchestrator config
    const orchestratorContent = `projectId=${projectId}`;
    zip.addFile(".orchestrator", Buffer.from(orchestratorContent));

    // README for the kit
    const readmeContent = `# AI Orchestrator Project Kit

## What's in this kit?

- **sync-client.js** - Auto-sync client for RAG and command execution
- **.cursorrules** - Cursor IDE integration rules (with batch mode)
- **.orchestrator** - Project ID configuration
- **sync-init.js** - Project ID setup script
- **start.sh** - Quick start script

## Quick Start

### 1. Install dependencies
\`\`\`bash
npm install chokidar
\`\`\`

### 2. Setup Project ID
\`\`\`bash
node sync-init.js
\`\`\`

### 3. Start sync client
\`\`\`bash
node sync-client.js
# OR with auto-approve:
node sync-client.js --auto-approve
# OR using npm scripts:
npm run sync:watch
npm run sync:watch:auto
\`\`\`

### 4. Start development server (in another terminal)
\`\`\`bash
npm run dev
\`\`\`

## Available Commands in Cursor

Use these commands in Cursor IDE:

\`\`\`bash
@orchestrator task                      - Get next available task (single task focus)
@orchestrator prompt <ID>               - Generate prompt for task
@orchestrator report <ID> <CONTENT>     - Send execution report (with context anchors)
@orchestrator done <ID>                - Mark task as DONE (QA check)
@orchestrator task_status <ID> <STATUS> - Update task status (IN_PROGRESS, DONE, etc.)
@orchestrator autopilot                 - Run automatic execution loop (5-task batches)
@orchestrator help                      - Show all commands
\`\`\`

## Important Notes

### Batch Mode (Context Protection)
- **Autopilot runs in batches of 5 tasks** to prevent context overflow
- After 5 tasks, it will STOP and ask you to start a new chat
- This prevents hallucinations and ensures quality work
- Simply open a new chat and run \`@orchestrator autopilot\` again

### Report Format
Every report MUST include:
- \`📌 CURRENT TASK: [ID] [Title]\` - context anchor
- What was done (files created/modified)
- Test logs (if required)
- Build results (if required)
- Proofs (command output, screenshots)

QA agent REJECTS reports without concrete evidence.

### Sync Client
- **Ignores:** node_modules, .git, .next, dist, build, logs, coverage
- **Files larger than 1MB are skipped**
- **Command execution:** agent can run shell commands (npm test, npm run build, etc.)
- Commands require user approval unless \`--auto-approve\` is used

### API Endpoints
- **get_next_task:** \`/api/ide?action=get_next_task&projectId=xxx\`
- **task details:** \`/api/ide?read_task&taskId=xxx\`
- **update status:** \`POST /api/ide\` with action: update_task_status

  ## Testing the Project

  1. Check API is running: http://localhost:3002
  2. Test get next task:
  \`\`\`bash
  curl -s "http://localhost:3002/api/ide?action=get_next_task&projectId=${projectId}"
  \`\`\`
  3. Test RAG search:
  \`\`\`bash
  curl -X POST http://localhost:3002/api/rag \\
    -H "Content-Type: application/json" \\
    -d '{"projectId": "${projectId}", "query": "test query"}'
  \`\`\`
  4. Test command execution:
  \`\`\`bash
  curl -X POST http://localhost:3002/api/sync/command \\
    -H "Content-Type: application/json" \\
    -d '{"projectId": "${projectId}", "command": "npm test", "reason": "Run tests"}'
  \`\`\`
  `;
    zip.addFile("README.md", Buffer.from(readmeContent));

    const zipBuffer = zip.toBuffer();

    return new NextResponse(zipBuffer as any, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="project-kit.zip"`,
      },
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[download-kit]", error);
    }
    return NextResponse.json({ error: "Failed to generate kit" }, { status: 500 });
  }
}
