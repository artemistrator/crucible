# AGENTS.md - Architecture Manifest for AI Orchestrator

This document outlines the current architecture, agent roles, communication protocols, and available tools within the AI Orchestrator system.

---

## 1. Core Principles

- **Agent Hive Protocol (AHP):** Distributed agents collaborate asynchronously via a central Message Bus (database).
- **Strict Gating:** Tasks (and their bug tickets) must pass QA verification before the pipeline proceeds. Rejected tasks trigger new fixing tickets.
- **Long-Term Memory (RAG):** Past failures (Global Insights) are vectorized and injected into Architect's prompts to prevent recurring mistakes.
- **Self-Correction:** Agents can autonomously identify, log, and create tickets for bugs, then fix them based on QA feedback.

---

## 2. Agent Roles & Responsibilities

| Role            | Key Responsibilities                                                  | Communication Target |
| :-------------- | :-------------------------------------------------------------------- | :------------------- |
| `TEAMLEAD`      | Manages task flow, dispatches `TASK_REQUEST` / `TICKET_REQUEST`, handles `QA_RESPONSE`. | `TASK_EXECUTOR`, `QA`  |
| `TASK_EXECUTOR` | Generates execution plans, performs coding tasks, sends `QA_REQUEST`. | `QA`, `TEAMLEAD`, `CSS` |
| `DEVOPS`        | (Specialized `TASK_EXECUTOR`) Initializes projects, configures environments. | `QA`, `TEAMLEAD`     |
| `BACKEND`       | (Specialized `TASK_EXECUTOR`) Implements backend logic, APIs.         | `QA`, `TEAMLEAD`     |
| `CSS`           | Analyzes/improves CSS, sends `STYLE_RESPONSE`.                        | `TASK_EXECUTOR`      |
| `QA`            | Verifies task completion, sends `QA_RESPONSE` (APPROVED/REJECTED).    | `TEAMLEAD`           |
| `REFLEXOLOGIST` | Analyzes session logs, generates `GlobalInsight` embeddings for RAG.  | (Internal / Logging) |

---

## 3. Communication Protocols (Message Bus)

- **Asynchronous:** All communication is via `AgentMessage` objects stored in a central database (Prisma).
- **Event-driven:** Messages have `eventType` (e.g., `TASK_REQUEST`, `QA_RESPONSE`, `TICKET_REQUEST`, `STYLE_REQUEST`, `STYLE_RESPONSE`).
- **Targeted:** Messages include `targetAgent` field.

---

## 4. Available Tools (via `tools.ts`)

All agents execute commands through a sandboxed environment managed by `tools.ts`.

| Tool                 | Description                                                 | Key Features                                                                   |
| :------------------- | :---------------------------------------------------------- | :----------------------------------------------------------------------------- |
| `executeCommand`     | Executes shell commands in project's `cwd`.                 | `sh` for execution, timeout, captures `stdout`/`stderr`.                       |
| `readFile`           | Reads file content from project's `cwd`.                    | Path normalization, error handling.                                            |
| `writeFile`          | Writes content to a file in project's `cwd`.                | **CRITICAL: OVERWRITES ENTIRE FILE. NO PLACEHOLDERS ALLOWED.** Path normalization. |
| `generateText`       | Calls LLM (OpenAI/Anthropic/Z.ai).                          | Global `maxTokens`, `temperature` (from `/settings`).                        |
| `generateTextZai`    | (Specific provider)                                         |                                                                                |
| `logInfo/Warn/Error` | Logs messages to `logs/session-[sessionId].log` & console.  | Narrative style with emojis.                                                   |
| `searchGlobalInsights` | Retrieves relevant `GlobalInsight` records (RAG).         | Uses embedding similarity.                                                     |
| `generateEmbedding`  | Creates vector embeddings for text (for RAG ingestion).     | Uses OpenAI `text-embedding-3-small`.                                          |

---

## 5. Project Workflow (Simplified)

1. **Idea -> Plan:** User inputs idea. Architect (via `/api/decompose-idea`) generates 3 `Plan`s.
2. **Plan Selection -> Tasks:** User selects a `Plan`. Architect (via `/api/generate-tasks`) creates `Task`s with `verificationCriteria` and `TaskDependency` graph. `GlobalInsight` (RAG) is injected here.
3. **Execution Loop:**
   - Dispatcher polls for `TODO` `Task`s or `OPEN` `Ticket`s (tickets have priority).
   - Assigns to `TASK_EXECUTOR` (or `DEVOPS`/`BACKEND`).
   - Agent executes `writeFile`, `executeCommand`, `readFile` using `tools`.
   - Creates `QA_REQUEST` with `VERIFICATION EVIDENCE` (including `head -n 200` & `sh .ai-temp-check.sh`).
4. **QA & Feedback:**
   - `QA` agent validates `VERIFICATION EVIDENCE`.
   - If `REJECTED`: `TEAMLEAD` creates `TICKET_REQUEST`, returns task to `OPEN` (up to 3 retries).
   - If `APPROVED`: `TEAMLEAD` triggers next `Task`.
5. **Reflection:** `REFLEXOLOGIST` analyzes session, creates `GlobalInsight` (embeddings) for future RAG.

---

## Future Enhancements (Roadmap)

- **Background Process Manager:** Tool to `start/stopBackgroundProcess` (e.g., `npm run dev`) for real-time testing of running applications.
- **Runtime Observability:** Tools to `readProcessLogs`, `curl/fetch` running services.
- **Automated UI Testing:** Integration with headless browsers (Playwright/Puppeteer) for end-to-end testing.
- **Code Refinement Agents:** `ScavengerAgent` for technical debt, `RuleGeneratorAgent` for converting insights into static analysis rules.
