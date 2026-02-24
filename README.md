# AI Orchestrator

**AI-powered project management and development automation system that transforms ideas into structured development plans.**

AI Orchestrator decomposes ideas into tasks, manages projects using AI agents, implements RAG for context management, provides web search capabilities, and learns from past projects. Features auto-execution mode for hands-off task completion.

---

## Recent Changes (last 2 days)

- **New API health endpoint**: Added `GET /api/hello` (`app/api/hello/route.ts`) that returns JSON `{ "message": "Hello from AI Orchestrator!" }`. Used for quick sanity checks via browser and `curl`, and for automated verification in orchestrator-driven workflows.
- **Extended internal documentation**: Added `docs/new_readme.md` with a deeply detailed description of:
  - Prisma schema (projects, plans, tasks, dependencies, execution sessions, message bus, RAG entities, billing, etc.)
  - Agent roles, message types, and execution flow (AHP vs legacy execution)
  - RAG pipeline, semantic search, and GlobalInsights memory
  - Tech stack tables for frontend, backend, database, AI providers, and tooling.

---

## Technical passport (v1.0 Demo)

This section summarizes the v1.0 refactor: **reliable QA (Hard Evidence), Docker DooD isolation, pgvector RAG, OpenVDL (vibe.yaml), RCA retries, AHP dispatcher rules, and safeguards.** Use as the main context for further development.

### 1. Reliable QA (Hard Evidence)

- **Mechanism**: QA no longer relies on fragile string matching ("PASS", "✓") in reports. Evidence is structured and checked explicitly.
- **Executor side** (`lib/agents/task-executor-agent.ts`, `lib/agents/execution-agent.ts`): Before sending the report to QA, the executor runs **verification steps** from `verificationCriteria`:
  - For each path in `artifacts`, it runs `ls -la <path>` and `cat <path>` (or equivalent) and appends the output to the report.
  - It runs the `automatedCheck` command and appends stdout/stderr.
  - This "Artifacts Check" and "automatedCheck" output is injected into the report so QA has **concrete evidence** (file existence, command exit codes, logs).
- **QA side** (`lib/agents/qa.ts`): Two-phase verification:
  - **Hard gates (code)**: Verification criteria are read from the task (`artifacts`, `automatedCheck`, `manualCheck`). The prompt instructs the model to look for **evidence per criterion** (e.g. `ls -la` output, test logs, build success). Missing evidence → REJECT with a clear "Missing evidence for: ..." message.
  - **Soft gates (LLM)**: Semantic check of code and reasoning; JSON response is parsed via `extractJsonFromText` (fenced blocks or first `{` to last `}`), then validated with `qaVerificationSchema` (status APPROVED/REJECTED, reasoning, confidence). Low-confidence REJECT can trigger a second opinion.

### 2. Isolation and safety (Docker DooD)

- **Mechanism**: **Docker-out-of-Docker (DooD)**. Each execution session runs in its own **temporary container**; host project code is bind-mounted.
- **Implementation** (`lib/execution/container-manager.ts`):
  - `ensureContainer(sessionId, projectPath)` — creates a long-lived container (e.g. `node:20-slim`) named `ai-orch-session-<sessionId>`, with `tail -f /dev/null`, mount `hostProjectPath:/app/project`, and user `HOST_UID:HOST_GID` so files are owned by the host user (no root-hell).
  - `executeInContainer(sessionId, command, timeoutMs)` — runs `docker exec` with a **5-minute default timeout**; on timeout throws; returns `{ stdout, stderr, exitCode }`.
  - `destroyContainer(sessionId)` — `docker rm -f` the session container.
  - Host paths are resolved via `HOST_PROJECTS_DIR`; internal paths like `/app/projects/...` are translated to `HOST_PROJECTS_DIR/...`.
- **Env**: `HOST_PROJECTS_DIR`, `HOST_UID`, `HOST_GID` are read from `.env` for portability (Mac/Linux).
- **Garbage collection** (`instrumentation.ts`): On Next.js startup (Node runtime), `cleanupOrphanedContainers()` is called: finds all containers with names starting with `ai-orch-session-` and removes them so old sessions do not leave stale containers.

### 3. Fast RAG (pgvector)

- **Optimization**: Similarity is computed **inside PostgreSQL** with pgvector (`<=>` operator), not in JavaScript loops.
- **APIs** (`lib/rag/search.ts`):
  - `searchGlobalInsights(query, limit)` — semantic search over `GlobalInsight` (historical lessons); used by decompose-idea and generate-tasks to inject past insights into prompts.
  - `searchSimilar` / project-scoped search — used by the **searchCodebase** tool.
- **Agent tools** (`lib/agents/tools.ts`):
  - **searchCodebase** (`createSearchCodebaseTool`): Embeds the query, runs a raw SQL query over `FileEmbedding` joined with `ProjectFile` (filter `similarity > 0.4`), returns `{ filePath, content, similarity }`.
  - **getCodeMap** (`createGetCodeMapTool`): Returns a **structural map** of the project: file paths + code entities (classes, functions, etc.) from the `CodeEntity` table — no file bodies, so the agent can "see" the skeleton of the codebase without reading full files.

### 4. OpenVDL (vibe.yaml)

- **Mechanism**: Project **"genetic code"**. Agents automatically receive rules from a config file in the project root.
- **Implementation**:
  - **Parser** (`lib/vibe/parser.ts`): `loadProjectVibe(projectId)` reads `vibe.yaml` or `vibe.json` from the project directory (via `getProjectDir`), parses with `yaml.parse` or `JSON.parse`; returns `VibeConfig | null`; never throws (missing file → null).
  - **Schema** (`lib/vibe/types.ts`): `VibeConfig` includes `architecture` (preferred_pattern, forbidden_patterns), `code_style` (naming, error_handling), `testing` (framework, require_for), `qa_rules` (mandatory_evidence, strict_guidelines).
  - **Injection** (`lib/agents/prompt-generator.ts`): When generating the task prompt, `loadProjectVibe(project.id)` is called; if present, a **vibe section** is built (preferred pattern, forbidden patterns, naming, error handling, testing framework, QA rules) and appended to the system prompt so the executor follows architecture and QA standards without extra instructions in the task text.

### 5. Smart retries (RCA)

- **Mechanism**: **Root Cause Analysis (RCA)**. On ticket (fix-after-reject) runs, the executor must **first** output a thought step that explains why the previous attempt failed and what will change.
- **Implementation** (`lib/agents/task-executor-agent.ts`): For `TICKET_REQUEST`, the system prompt includes a strict rule: the **first** element of the `steps` array **must** be a **thought-only** step (no `toolName`), containing the RCA. The prompt says: "Your VERY FIRST element in the 'steps' array MUST be a thought-only step ... that performs a Root Cause Analysis (RCA) of the previous failed attempt" and "Do NOT use any tools until you have outputted this RCA thought." The agent logs these thoughts; this reduces repeated identical failures.

### 6. AHP dispatcher stability

- **Dependencies** (`lib/execution/agent-factory.ts`, `lib/agents/team-lead-agent.ts`): The next runnable task is chosen with Prisma: `dependencies: { every: { dependsOn: { status: "DONE" } } }`. So a task is only run when **all** its `dependsOn` tasks are DONE.
- **Strict finalization** (`app/api/execution-sessions/run-ahp/route.ts`, `lib/execution/agent-factory.ts`): The session is considered complete only when **all** plan tasks have status DONE (and no OPEN tickets). `isSessionComplete()` checks `planTasks.every(t => t.status === "DONE")` and no pending messages.
- **Robust parsing**: In the task executor, the LLM plan response is normalized with a regex to extract a single JSON object: `planJsonText.replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/m, "$1")`. If parsing or validation fails (e.g. invalid JSON or empty steps), the **ticket** is set to REJECTED and a **system comment** is created with the error message (`createTicketRejectionComment`), so the run does not hang and the user sees a clear reason.

### 7. Safeguards

- **Timeouts**: Every command run in the session container uses `executeInContainer(..., timeoutMs)` with a default of **5 minutes** (`DEFAULT_COMMAND_TIMEOUT_MS` in `container-manager.ts`). On timeout, an `AbortError` is thrown and the command result is treated as failed.
- **Garbage collection**: See §2 — `cleanupOrphanedContainers()` in `instrumentation.ts` on app startup.

### Key files (v1.0)

| Area | File | Role |
|------|------|------|
| Isolation | `lib/execution/container-manager.ts` | DooD: ensureContainer, executeInContainer, destroyContainer, cleanupOrphanedContainers |
| Vibe | `lib/vibe/parser.ts`, `lib/vibe/types.ts` | Load and type vibe.yaml / vibe.json |
| Prompts | `lib/agents/prompt-generator.ts` | Vibe injection + dependency context; RCA is in task-executor prompt |
| Tools | `lib/agents/tools.ts` | searchCodebase, getCodeMap, patchFile (local + cloud), readFile, executeCommand, etc. |
| Startup | `instrumentation.ts` | Calls cleanupOrphanedContainers on Node startup |
| QA | `lib/agents/qa.ts` | Hard/soft gates, extractJsonFromText, qaVerificationSchema |
| Executor | `lib/agents/task-executor-agent.ts` | Verification phase (artifacts + automatedCheck), RCA for tickets, regex plan extraction, REJECTED + comment on parse failure |
| Dispatcher | `lib/execution/agent-factory.ts`, `app/api/execution-sessions/run-ahp/route.ts` | Dependencies filter, all-DONE finalization |

### Planned next (v1.1)

- **patchFile**: Encourage agents to use it for edits instead of full-file rewrites.
- **Frontend**: SSE for real-time logs in ExecutionConsole; fix task status sync on tiles.
- **Reflexologist 2.0**: Auto-append new lessons to the project’s `vibe.yaml` after a session.
- **Folder trap**: Adjust init prompt so `create-next-app` does not create an extra subfolder, or agent moves files to the intended root.

---

## Tech Stack

| Layer | Technologies |
|-------|--------------|
| **Frontend** | Next.js 15 (App Router), React 19, Tailwind CSS, shadcn/ui |
| **Backend** | Next.js API Routes, Vercel AI SDK (OpenAI, Anthropic, Z.ai) |
| **Database** | PostgreSQL with pgvector, Prisma ORM |
| **Infrastructure** | Docker Compose |
| **CLI** | TypeScript, Commander.js, Axios |
| **External** | Tavily API (web search), OpenAI Embeddings |

---

## Key Features

### 1. AI Decomposition

- **Idea → Plans**: Enter an idea in natural language, get 3 architectural plans with different tech stacks
- **Plan → Tasks**: Automatic task decomposition with dependencies and verification criteria
- **Global Memory**: AI learns from deleted projects and applies insights to new projects
- **Smart Complexity**: Automatic project size estimation (S/M/L/XL)

### 2. Smart Task Management

- **Kanban Board**: TODO → IN_PROGRESS → REVIEW → WAITING_APPROVAL → DONE
- **Human-in-the-Loop**: Optional approval gate before tasks move to DONE
- **Agent Assignment**: Frontend, Backend, DevOps, Teamlead, Cursor, QA agents
- **Dependency Graph**: Visualize and manage task dependencies with @xyflow/react
- **Detailed Prompts**: AI-generated coding prompts for each task

### 3. Auto Execution Mode

- **Fully Automated**: Execution agent picks up tasks and completes them automatically
- **Real-time Console**: Live terminal view with command execution and AI responses
- **Cost Control**: Set spending limits for execution sessions
- **Pause/Resume**: Control execution flow at any time
- **Command Approval**: Optional manual approval for each command

### 4. QA Code Review

- **Web Search**: Tavily API integration for up-to-date documentation
- **File Reading**: QA agent reads project files via `readFile` tool
- **Strict Verification**: Rejects tasks without concrete evidence (test logs, build output)
- **Debug Analysis**: Automatic failure analysis and specific feedback

### 5. RAG & Context

- **File Sync**: Real-time file synchronization with RAG embeddings
- **Vector Search**: pgvector-based semantic search across project files
- **Code Entities**: Automatic extraction of classes, functions, imports
- **Global Context**: Project-level rules and context for all agents

### 6. Dynamic Replanning

- **Architect Agent**: Updates remaining tasks based on completed work
- **Impact Analysis**: Automatically adjusts dependent tasks
- **ADR Generation**: Architecture Decision Records for plan changes

### 7. FinOps - Cost Tracking

- **Automatic Tracking**: All AI calls logged with tokens and cost
- **Project Dashboard**: Per-project cost breakdown
- **Global Billing**: `/api/billing` for total expenses
- **Model Comparison**: Track costs across different AI providers

### 8. CLI Tool

Command-line interface for integrating external projects:

```bash
# Initialize connection
orchestrator init

# Get next task
orchestrator task next

# Report progress
orchestrator report <taskId> --content "Work done..." --file path/to/file.ts

# Mark task complete
orchestrator done <taskId>

# Get AI prompt for task
orchestrator prompt <taskId>
```

---

## Installation & Setup

### 1. Clone Repository

```bash
git clone <your-repo-url>
cd ai-orchestrator
```

### 2. Environment Configuration

```bash
cp .env.example .env
```

**Required Variables:**

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL URL with pgvector | ✅ |
| `OPENAI_API_KEY` | OpenAI API key | For OpenAI |
| `ANTHROPIC_API_KEY` | Anthropic API key | For Claude |
| `ZAI_API_KEY` | Z.ai (GLM) API key | For Z.ai |
| `TAVILY_API_KEY` | Tavily API key | For web search |

### 3. Docker Deployment

```bash
# First time (clean database)
docker compose down -v
docker compose up -d --build

# Subsequent runs
docker compose up -d --build
```

**Services:**
- App: http://localhost:3002
- Adminer (DB UI): http://localhost:8081
- PostgreSQL: localhost:5433

### 4. Database Migrations

Migrations run automatically on first start. For manual updates:

```bash
docker compose exec app npx prisma db push
```

### 5. Sync Client Modes & Env

- **Host sync-client (recommended for local dev):**
  - Run `node sync-client.js` from the downloaded kit on your host machine.
  - By default it connects to `http://localhost:3002/api/sync` (exported from docker).
  - You can override with `--url http://localhost:3002/api/sync`.
- **Server sync-client (inside container, auto-start):**
  - Controlled by env flags:
    - `SYNC_CLIENT_AUTOSTART=true` — allow server to spawn sync-client processes per project.
    - `NEXT_PUBLIC_SYNC_CLIENT_AUTOSTART=true` — UI hint that sync-client is started on the server side.
  - Inside docker the app listens on `http://app:3000`; `INTERNAL_APP_URL` is set accordingly.

---

## CLI Setup

Navigate to CLI directory and install dependencies:

```bash
cd cli
npm install
npm run build
```

**Usage:**

```bash
# Link globally (optional)
npm link

# Or run directly
npm run dev <command>
```

**Workflow:**
1. `orchestrator init` - Configure project connection
2. `orchestrator task next` - Fetch current task
3. Work on task...
4. `orchestrator report <taskId> --content "..."` - Submit progress
5. `orchestrator done <taskId>` - Mark complete

---

## Auto Execution

Start automated task execution from the web UI:

1. Open project plan page
2. Click "Start Execution" button
3. Configure:
   - **Auto-approve**: Skip command confirmations
   - **Cost limit**: Maximum spending for session
4. Monitor progress in the Execution Console

The execution agent will:
1. Pick up pending tasks
2. Generate detailed prompts
3. Execute commands
4. Verify completion via QA
5. Move to next task

---

## API Endpoints

### Core Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/decompose-idea` | Create project + 3 plans |
| `POST` | `/api/generate-tasks` | Generate tasks from plan |
| `POST` | `/api/generate-coding-prompt` | Get task prompt |
| `POST` | `/api/upload` | Upload files |
| `GET`/`POST` | `/api/tasks` | Task CRUD |
| `POST` | `/api/tasks/[taskId]/approve` | Approve task completion |
| `GET` | `/api/tasks/[taskId]/qa-logs` | QA verification logs |

### Execution Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/execution-sessions/start` | Start auto execution |
| `POST` | `/api/execution-sessions/[id]/pause` | Pause execution |
| `POST` | `/api/execution-sessions/[id]/resume` | Resume execution |
| `POST` | `/api/execution-sessions/[id]/stop` | Stop execution |
| `GET` | `/api/execution-sessions/[id]/logs` | Get execution logs |
| `POST` | `/api/execution-sessions/chat` | Send message to AI |

### Integration Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/webhooks/github` | GitHub webhooks |
| `GET` | `/api/mcp/tasks` | MCP: Get tasks |
| `POST` | `/api/ide` | IDE integration |
| `POST` | `/api/sync` | File sync |
| `POST` | `/api/sync/command` | Create command |

### Other Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/billing` | Global billing stats |
| `GET` | `/api/insights` | Learned insights |
| `GET` | `/api/projects/[id]/billing` | Project billing |

---

## Agent Tools

- `searchKnowledge` - RAG search across project files
- `webSearch` - Internet search via Tavily API
- `readFile` - Read file contents
- `executeCommand` - Execute shell commands
- `findRelatedFiles` - Find code dependencies

---

## Project Structure

```
ai-orchestrator/
├── app/
│   ├── api/                    # API Routes
│   │   ├── ai-agent/          # Unified AI agent endpoint
│   │   ├── billing/           # Global billing
│   │   ├── comments/          # Comments CRUD
│   │   ├── decompose-idea/    # Idea decomposition
│   │   ├── download-kit/      # Quick start kit download
│   │   ├── execution-sessions/# Auto execution API
│   │   ├── files/             # File management
│   │   ├── generate-coding-prompt/
│   │   ├── generate-tasks/
│   │   ├── ide/               # IDE integration
│   │   ├── insights/          # Global insights
│   │   ├── mcp/               # MCP endpoints
│   │   ├── projects/          # Projects CRUD & billing
│   │   ├── sync/              # File sync & commands
│   │   ├── tasks/             # Tasks CRUD, QA logs, approve
│   │   └── webhooks/          # GitHub webhooks
│   ├── debug-console/         # Debug console page
│   ├── project/[id]/          # Project pages
│   ├── layout.tsx
│   └── page.tsx
├── components/                 # UI Components
│   ├── BillingDashboard.tsx
│   ├── ExecutionConsole.tsx   # Auto execution terminal
│   ├── GenerateTasksButton.tsx
│   ├── InsightsModal.tsx
│   ├── PlanList.tsx
│   ├── ProjectContextSheet.tsx
│   ├── ProjectSidebar.tsx
│   ├── StartExecutionModal.tsx # Execution config modal
│   ├── SyncStatus.tsx
│   ├── TaskDetailSheet.tsx
│   ├── TaskGraph.tsx
│   ├── TaskListClient.tsx
│   └── ui/                    # shadcn/ui components
├── lib/
│   ├── agents/                # AI Agents
│   │   ├── architect.ts       # Plan creation & replanning
│   │   ├── debug.ts           # Failure analysis
│   │   ├── doc-writer.ts      # ADR generation
│   │   ├── execution-agent.ts # Auto task execution
│   │   ├── project-context.ts # Context gathering
│   │   ├── prompt-generator.ts
│   │   ├── qa.ts              # Quality assurance
│   │   └── tools.ts           # Agent tools
│   ├── ai/                    # AI providers & pricing
│   │   ├── call.ts
│   │   ├── parse.ts
│   │   ├── pricing.ts
│   │   ├── providers.ts
│   │   └── zai.ts
│   ├── execution/             # Execution session management
│   │   ├── session-manager.ts
│   │   └── sse-store.ts
│   ├── rag/                   # RAG system
│   │   ├── chunk.ts
│   │   ├── embeddings.ts
│   │   ├── index.ts
│   │   ├── parser.ts
│   │   ├── search.ts
│   │   └── store.ts
│   ├── prisma.ts
│   ├── project-workspace.ts
│   ├── qa-logger.ts
│   └── utils.ts
├── prisma/
│   └── schema.prisma          # Database schema
├── public/
│   ├── sync-client.js         # Legacy sync client
│   ├── sync-init.js           # Legacy sync init
│   └── uploads/               # Uploaded files
├── cli/                       # Command-line interface
│   ├── index.ts              # CLI entry point
│   ├── docs/
│   │   └── AI_AGENTS_GUIDE.md
│   └── package.json
├── docker-compose.yml
├── Dockerfile
├── .env.example
└── README.md
```

---

## Database Schema

**Core Models:**
- `Project` - Project container with idea, context, settings
- `Plan` - Architectural plans with tech stack
- `Task` - Tasks with status, executor, verification criteria
- `TaskDependency` - Task relationships
- `Comment` - Task comments
- `ProjectFile` - Uploaded files
- `FileEmbedding` - Vector embeddings for RAG
- `CodeEntity` - Extracted code entities
- `CodeDependency` - Code relationships
- `GlobalInsight` - Learned lessons from deleted projects
- `TokenUsage` - AI usage tracking
- `SyncCommand` - Commands for client execution
- `ExecutionSession` - Auto execution sessions
- `ExecutionLog` - Execution session logs

---

## Semantic Code Search (`searchCodebase`)

AI Orchestrator maintains a semantic index of your synced project files:

- The **sync client** (`public/sync-client.js` or project-local `.orchestrator/sync-client.js`) watches your workspace and sends file updates to the API.
- The `/api/sync` endpoint stores/updates `ProjectFile` records and runs the RAG pipeline (`processFile`) to create/update `FileEmbedding` rows in PostgreSQL with pgvector.
- Each file is chunked and embedded; chunks are stored with their source `ProjectFile`.

The TASK_EXECUTOR agent can call the `searchCodebase` tool to perform **semantic search across the entire codebase**:

- It generates an embedding for the natural-language query.
- It runs a pgvector similarity query over `FileEmbedding` joined with `ProjectFile`, scoped to the current `projectId`.
- It returns the most relevant chunks as `{ filePath, content, similarity }`, filtered to `similarity > 0.4` and sorted by similarity (highest first).

Operational requirements:

- `DATABASE_URL` must point to PostgreSQL with the `pgvector` extension enabled.
- The `FileEmbedding` and `GlobalInsight` tables must have an `embedding` column compatible with pgvector similarity operators (`<=>`).

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     User Interface                           │
│  Task Lists | Task Graph | Billing | Execution Console      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   API Layer (Next.js)                        │
│  decompose-idea | generate-tasks | qa-check | execution     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  AI Agents                                   │
│  ┌──────────┐ ┌──────┐ ┌─────────┐ ┌────────┐ ┌──────────┐  │
│  │Architect │ │  QA  │ │Prompt   │ │  Doc   │ │Execution│   │
│  │Agent     │ │Agent │ │Generator│ │Writer  │ │ Agent   │   │
│  └──────────┘ └──────┘ └─────────┘ └────────┘ └──────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Data Layer                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐    │
│  │ PostgreSQL  │  │  pgvector   │  │  File Embeddings │    │
│  └─────────────┘  └─────────────┘  └──────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  External Services                           │
│  ┌─────────┐ ┌──────────┐ ┌─────────┐ ┌──────────┐         │
│  │ OpenAI  │ │Anthropic │ │  Z.ai   │ │ Tavily   │         │
│  └─────────┘ └──────────┘ └─────────┘ └──────────┘         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Client Integration                          │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐        │
│  │ CLI Tool    │ │ Sync Client │ │   Cursor IDE  │        │
│  └─────────────┘  └─────────────┘  └──────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

---

## Next Steps

For enterprise deployment:

- **Authentication**: SSO (OAuth2/OIDC), role-based access
- **Multi-tenancy**: Organization isolation, quotas
- **Observability**: Logging, metrics (Prometheus), tracing
- **Security**: API key management, rate limiting
- **Scaling**: Queue-based processing (Bull, SQS)
- **Backup**: Automated database backups

---

## License

MIT

---

---

# AI Orchestrator (Русская версия)

**AI-система управления проектами и автоматизации разработки, превращающая идеи в структурированные планы.**

AI Orchestrator декомпозирует идеи в задачи, управляет проектами с помощью AI-агентов, использует RAG для управления контекстом, предоставляет возможности веб-поиска и обучается на прошлых проектах. Включает режим автоматического выполнения задач.

**Технический паспорт v1.0** (надёжное ядро QA, Docker DooD, pgvector RAG, vibe.yaml, RCA-ретраи, AHP-диспетчер, таймауты и очистка контейнеров) описан выше в разделе [Technical passport (v1.0 Demo)](#technical-passport-v10-demo).

---

## Технологический стек

| Слой | Технологии |
|------|------------|
| **Frontend** | Next.js 15 (App Router), React 19, Tailwind CSS, shadcn/ui |
| **Backend** | Next.js API Routes, Vercel AI SDK (OpenAI, Anthropic, Z.ai) |
| **Database** | PostgreSQL с pgvector, Prisma ORM |
| **Инфраструктура** | Docker Compose |
| **CLI** | TypeScript, Commander.js, Axios |
| **Внешние сервисы** | Tavily API (веб-поиск), OpenAI Embeddings |

---

## Основные возможности

### 1. AI Декомпозиция

- **Идея → Планы**: Введите идею естественным языком, получите 3 архитектурных плана с разными технологическими стеками
- **План → Задачи**: Автоматическая декомпозиция с зависимостями и критериями верификации
- **Глобальная память**: AI учится на удаленных проектах и применяет инсайты к новым проектам
- **Умная оценка сложности**: Автоматическая оценка размера проекта (S/M/L/XL)

### 2. Умное управление задачами

- **Канбан доска**: TODO → IN_PROGRESS → REVIEW → WAITING_APPROVAL → DONE
- **Human-in-the-Loop**: Опциональное подтверждение перед переходом в DONE
- **Назначение агентов**: Frontend, Backend, DevOps, Teamlead, Cursor, QA агенты
- **Граф зависимостей**: Визуализация и управление зависимостями задач через @xyflow/react
- **Детальные промпты**: AI-генерация промптов для кодинга для каждой задачи

### 3. Режим автоматического выполнения

- **Полная автоматизация**: Execution agent берет задачи и выполняет их автоматически
- **Консоль в реальном времени**: Живой терминал с выполнением команд и ответами AI
- **Контроль затрат**: Установка лимитов расходов на сессии выполнения
- **Пауза/Возобновление**: Контроль выполнения в любой момент
- **Подтверждение команд**: Опциональное ручное подтверждение каждой команды

### 4. QA Code Review

- **Веб-поиск**: Интеграция Tavily API для актуальной документации
- **Чтение файлов**: QA агент читает файлы проекта через инструмент `readFile`
- **Строгая верификация**: Отклонение задач без конкретных доказательств (логи тестов, вывод сборки)
- **Анализ ошибок**: Автоматический анализ отказов и конкретная обратная связь

### 5. RAG и контекст

- **Синхронизация файлов**: Реальтайм синхронизация файлов с RAG эмбеддингами
- **Векторный поиск**: Семантический поиск по файлам проекта на базе pgvector
- **Сущности кода**: Автоматическое извлечение классов, функций, импортов
- **Глобальный контекст**: Проектные правила и контекст для всех агентов

### 6. Динамическое перепланирование

- **Архитектор**: Обновление оставшихся задач на основе выполненной работы
- **Анализ влияния**: Автоматическая корректировка зависимых задач
- **Генерация ADR**: Architecture Decision Records для изменений плана

### 7. FinOps — учет затрат

- **Автоматический трекинг**: Все вызовы AI логируются с токенами и стоимостью
- **Дашборд проекта**: Детализация затрат по проекту
- **Глобальный биллинг**: `/api/billing` для общих расходов
- **Сравнение моделей**: Отслеживание затрат между разными AI провайдерами

### 8. CLI инструмент

Командная строка для интеграции внешних проектов:

```bash
# Инициализация подключения
orchestrator init

# Получить следующую задачу
orchestrator task next

# Отчет о прогрессе
orchestrator report <taskId> --content "Работа выполнена..." --file path/to/file.ts

# Отметить задачу выполненной
orchestrator done <taskId>

# Получить AI промпт для задачи
orchestrator prompt <taskId>
```

---

## Установка и настройка

### 1. Клонирование репозитория

```bash
git clone <your-repo-url>
cd ai-orchestrator
```

### 2. Настройка окружения

```bash
cp .env.example .env
```

**Обязательные переменные:**

| Переменная | Описание | Обязательно |
|------------|----------|-------------|
| `DATABASE_URL` | URL PostgreSQL с pgvector | ✅ |
| `OPENAI_API_KEY` | Ключ OpenAI API | Для OpenAI |
| `ANTHROPIC_API_KEY` | Ключ Anthropic | Для Claude |
| `ZAI_API_KEY` | Ключ Z.ai (GLM) | Для Z.ai |
| `TAVILY_API_KEY` | Ключ Tavily | Для веб-поиска |

### 3. Развертывание через Docker

```bash
# Первый запуск (чистая база)
docker compose down -v
docker compose up -d --build

# Последующие запуски
docker compose up -d --build
```

**Сервисы:**
- Приложение: http://localhost:3002
- Adminer (DB UI): http://localhost:8081
- PostgreSQL: localhost:5433

### 4. Миграции базы данных

Миграции выполняются автоматически при первом запуске. Для ручного обновления:

```bash
docker compose exec app npx prisma db push
```

---

## Настройка CLI

Перейдите в директорию CLI и установите зависимости:

```bash
cd cli
npm install
npm run build
```

**Использование:**

```bash
# Глобальная ссылка (опционально)
npm link

# Или запуск напрямую
npm run dev <command>
```

**Рабочий процесс:**
1. `orchestrator init` - Настройка подключения к проекту
2. `orchestrator task next` - Получение текущей задачи
3. Работа над задачей...
4. `orchestrator report <taskId> --content "..."` - Отправка прогресса
5. `orchestrator done <taskId>` - Отметка выполнения

---

## Автоматическое выполнение

Запуск автоматического выполнения задач из веб-интерфейса:

1. Откройте страницу плана проекта
2. Нажмите кнопку "Start Execution"
3. Настройте:
   - **Auto-approve**: Пропуск подтверждений команд
   - **Cost limit**: Максимальный бюджет сессии
4. Следите за прогрессом в Execution Console

Execution agent будет:
1. Брать ожидающие задачи
2. Генерировать детальные промпты
3. Выполнять команды
4. Верифицировать завершение через QA
5. Переходить к следующей задаче

---

## API Endpoints

### Основные endpoints

| Метод | Путь | Описание |
|-------|------|----------|
| `POST` | `/api/decompose-idea` | Создать проект + 3 плана |
| `POST` | `/api/generate-tasks` | Генерация задач из плана |
| `POST` | `/api/generate-coding-prompt` | Получить промпт задачи |
| `POST` | `/api/upload` | Загрузка файлов |
| `GET`/`POST` | `/api/tasks` | CRUD задач |
| `POST` | `/api/tasks/[taskId]/approve` | Подтвердить выполнение |
| `GET` | `/api/tasks/[taskId]/qa-logs` | Логи QA верификации |

### Endpoints выполнения

| Метод | Путь | Описание |
|-------|------|----------|
| `POST` | `/api/execution-sessions/start` | Запуск авто-выполнения |
| `POST` | `/api/execution-sessions/[id]/pause` | Пауза выполнения |
| `POST` | `/api/execution-sessions/[id]/resume` | Возобновление |
| `POST` | `/api/execution-sessions/[id]/stop` | Остановка |
| `GET` | `/api/execution-sessions/[id]/logs` | Получение логов |
| `POST` | `/api/execution-sessions/chat` | Отправка сообщения AI |

### Интеграционные endpoints

| Метод | Путь | Описание |
|-------|------|----------|
| `POST` | `/api/webhooks/github` | GitHub вебхуки |
| `GET` | `/api/mcp/tasks` | MCP: получить задачи |
| `POST` | `/api/ide` | IDE интеграция |
| `POST` | `/api/sync` | Синхронизация файлов |
| `POST` | `/api/sync/command` | Создание команды |

### Другие endpoints

| Метод | Путь | Описание |
|-------|------|----------|
| `GET` | `/api/billing` | Глобальная статистика |
| `GET` | `/api/insights` | Извлеченные инсайты |
| `GET` | `/api/projects/[id]/billing` | Биллинг проекта |

---

## Инструменты агентов

- `searchKnowledge` - RAG поиск по файлам проекта
- `webSearch` - Поиск в интернете через Tavily API
- `readFile` - Чтение содержимого файлов
- `executeCommand` - Выполнение shell команд
- `findRelatedFiles` - Поиск зависимостей кода

---

## Структура проекта

```
ai-orchestrator/
├── app/
│   ├── api/                    # API Routes
│   │   ├── ai-agent/          # Unified AI agent endpoint
│   │   ├── billing/           # Глобальный биллинг
│   │   ├── comments/          # CRUD комментариев
│   │   ├── decompose-idea/    # Декомпозиция идей
│   │   ├── download-kit/      # Скачивание quick start kit
│   │   ├── execution-sessions/# API авто-выполнения
│   │   ├── files/             # Управление файлами
│   │   ├── generate-coding-prompt/
│   │   ├── generate-tasks/
│   │   ├── ide/               # IDE интеграция
│   │   ├── insights/          # Глобальные инсайты
│   │   ├── mcp/               # MCP endpoints
│   │   ├── projects/          # CRUD проектов и биллинг
│   │   ├── sync/              # Синхронизация и команды
│   │   ├── tasks/             # CRUD задач, QA логи, подтверждение
│   │   └── webhooks/          # GitHub вебхуки
│   ├── debug-console/         # Страница debug консоли
│   ├── project/[id]/          # Страницы проектов
│   ├── layout.tsx
│   └── page.tsx
├── components/                 # UI компоненты
│   ├── BillingDashboard.tsx
│   ├── ExecutionConsole.tsx   # Терминал авто-выполнения
│   ├── GenerateTasksButton.tsx
│   ├── InsightsModal.tsx
│   ├── PlanList.tsx
│   ├── ProjectContextSheet.tsx
│   ├── ProjectSidebar.tsx
│   ├── StartExecutionModal.tsx # Модалка настроек выполнения
│   ├── SyncStatus.tsx
│   ├── TaskDetailSheet.tsx
│   ├── TaskGraph.tsx
│   ├── TaskListClient.tsx
│   └── ui/                    # shadcn/ui компоненты
├── lib/
│   ├── agents/                # AI Агенты
│   │   ├── architect.ts       # Создание планов и перепланирование
│   │   ├── debug.ts           # Анализ ошибок
│   │   ├── doc-writer.ts      # Генерация ADR
│   │   ├── execution-agent.ts # Авто-выполнение задач
│   │   ├── project-context.ts # Сбор контекста
│   │   ├── prompt-generator.ts
│   │   ├── qa.ts              # Quality assurance
│   │   └── tools.ts           # Инструменты агентов
│   ├── ai/                    # AI провайдеры и прайсинг
│   │   ├── call.ts
│   │   ├── parse.ts
│   │   ├── pricing.ts
│   │   ├── providers.ts
│   │   └── zai.ts
│   ├── execution/             # Управление сессиями выполнения
│   │   ├── session-manager.ts
│   │   └── sse-store.ts
│   ├── rag/                   # RAG система
│   │   ├── chunk.ts
│   │   ├── embeddings.ts
│   │   ├── index.ts
│   │   ├── parser.ts
│   │   ├── search.ts
│   │   └── store.ts
│   ├── prisma.ts
│   ├── project-workspace.ts
│   ├── qa-logger.ts
│   └── utils.ts
├── prisma/
│   └── schema.prisma          # Схема базы данных
├── public/
│   ├── sync-client.js         # Legacy sync client
│   ├── sync-init.js           # Legacy sync init
│   └── uploads/               # Загруженные файлы
├── cli/                       # Командная строка
│   ├── index.ts              # Точка входа CLI
│   ├── docs/
│   │   └── AI_AGENTS_GUIDE.md
│   └── package.json
├── docker-compose.yml
├── Dockerfile
├── .env.example
└── README.md
```

---

## Схема базы данных

**Основные модели:**
- `Project` - Контейнер проекта с идеей, контекстом, настройками
- `Plan` - Архитектурные планы с технологическим стеком
- `Task` - Задачи со статусом, исполнителем, критериями верификации
- `TaskDependency` - Связи между задачами
- `Comment` - Комментарии к задачам
- `ProjectFile` - Загруженные файлы
- `FileEmbedding` - Векторные эмбеддинги для RAG
- `CodeEntity` - Извлеченные сущности кода
- `CodeDependency` - Связи кода
- `GlobalInsight` - Извлеченные уроки из удаленных проектов
- `TokenUsage` - Трекинг использования AI
- `SyncCommand` - Команды для выполнения на клиенте
- `ExecutionSession` - Сессии авто-выполнения
- `ExecutionLog` - Логи сессий выполнения

---

## Архитектура

```
┌─────────────────────────────────────────────────────────────┐
│                     Пользовательский интерфейс               │
│  Списки задач | Граф задач | Биллинг | Консоль выполнения   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   API Layer (Next.js)                        │
│  декомпозиция | генерация задач | QA проверка | выполнение  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  AI Агенты                                   │
│  ┌──────────┐ ┌──────┐ ┌─────────┐ ┌────────┐ ┌──────────┐  │
│  │Архитектор│ │  QA  │ │Генератор│ │  Doc   │ │Выполнение│  │
│  │  Агент   │ │Агент │ │ Промптов│ │Writer  │ │  Агент  │   │
│  └──────────┘ └──────┘ └─────────┘ └────────┘ └──────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Слой данных                                │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐    │
│  │ PostgreSQL  │  │  pgvector   │  │  File Embeddings │    │
│  └─────────────┘  └─────────────┘  └──────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Внешние сервисы                             │
│  ┌─────────┐ ┌──────────┐ ┌─────────┐ ┌──────────┐         │
│  │ OpenAI  │ │Anthropic │ │  Z.ai   │ │ Tavily   │         │
│  └─────────┘ └──────────┘ └─────────┘ └──────────┘         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Клиентская интеграция                       │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐        │
│  │ CLI Tool    │ │ Sync Client │ │   Cursor IDE  │        │
│  └─────────────┘  └─────────────┘  └──────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

---

## Следующие шаги

Для enterprise развертывания:

- **Аутентификация**: SSO (OAuth2/OIDC), ролевой доступ
- **Мульти-тенантность**: Изоляция по организациям, квоты
- **Наблюдаемость**: Логирование, метрики (Prometheus), трассировка
- **Безопасность**: Управление API ключами, rate limiting
- **Масштабирование**: Очередная обработка (Bull, SQS)
- **Резервное копирование**: Автоматические бэкапы БД

---

## Лицензия

MIT
