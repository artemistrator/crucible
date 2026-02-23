## Debugging Direct Execution Mode

This repo includes a small set of Node scripts that help you trace the Direct Execution pipeline end-to-end:

- **SSE stream**: check that execution sessions start and emit events.
- **Sync client commands**: check that approved commands are visible to the sync client.
- **Database state**: check that the UI / APIs are actually creating records.

All commands below are assumed to be run from the `ai-orchestrator` directory.

---

### 1. Prerequisites

- **App running**
  - Make sure the Next.js app is running and accessible:
    - Locally: `npm run dev` (defaults to `http://localhost:3000`).
  - Optionally override via:
    - `export BASE_URL="http://localhost:3000"` (or your deployed URL).

- **Database**
  - `DATABASE_URL` must be set and reachable.
  - Migrations should be applied (example):
    - `npx prisma migrate deploy`
    - or `npx prisma db push`

- **Project ID for debugging**
  - Use the helper script to get or create a project:
    - `node scripts/get-or-create-project.js`
  - Copy the `id` field from the JSON output and export it:
    - `export DEBUG_PROJECT_ID="<PROJECT_ID_FROM_OUTPUT>"`

These env vars are used by the debug scripts:

- `BASE_URL` (optional, default: `http://localhost:3000`)
- `DEBUG_PROJECT_ID` (required)

---

### 2. Database snapshot: `check-db-state.js`

**Command:**

- `npm run debug:db`
  - or `node scripts/debug/check-db-state.js`

**What it does:**

- Connects to the DB via Prisma.
- Prints the last 5 records for:
  - `Project`
  - `ExecutionSession`
  - `SyncCommand`

**Healthy output looks like:**

- `Projects (last 5)`:
  - Contains at least one project (including the debug one).
- `ExecutionSessions (last 5)`:
  - Shows sessions being created when you start Direct Execution in the UI.
- `SyncCommands (last 5)`:
  - Shows commands when agents/systems schedule work for the sync client.

**If something is off:**

- `Projects (last 5)` is empty:
  - The system is not creating projects; check UI flows and `/api/projects` routes.
- `ExecutionSessions (last 5)` is empty even after starting Direct Execution in UI:
  - The UI might not be calling `/api/execution-sessions/start`, or the route is failing.
- `SyncCommands (last 5)` is empty after running Direct Execution and sync-client:
  - No commands are being created; check the execution agent and `/api/sync/command` POST.

---

### 3. SSE pipeline: `test-sse-stream.js`

**Command:**

- `npm run debug:sse`
  - or `node scripts/debug/test-sse-stream.js`

**What it does:**

1. `POST /api/execution-sessions/start`
   - Starts a new execution session for `DEBUG_PROJECT_ID`.
2. `GET /api/execution-sessions/:sessionId/events`
   - Opens an SSE stream for that session.
3. `POST /api/execution-sessions/chat`
   - Sends a simple `"Ping"` user message into the session.
4. Waits up to **5 seconds** for SSE `data:` events.

**Expected output (happy path):**

- Logs like:
  - `Started session <SESSION_ID> for project <DEBUG_PROJECT_ID>`
  - `SSE stream connected. Waiting for events...`
  - One or more `Event:` payloads (often `command_*`, `task_*`, or error messages depending on your agent).
- Final line:
  - `SSE stream OK (received at least one event).`

**Timeout behavior:**

- If no SSE `data:` events arrive within 5 seconds, you will see:
  - `TIMEOUT: no SSE events received within 5000ms (aborting connection)`
  - `TIMEOUT: SSE stream connected but no data events were received.`

**How to interpret failures:**

- Fails at `/api/execution-sessions/start` (non-200):
  - Likely DB / project problem (missing project, bad `DEBUG_PROJECT_ID`, or DB unreachable).
- SSE `GET` fails or returns non-200:
  - Check `/api/execution-sessions/[sessionId]/events` route and server logs.
- SSE connects but **no events**:
  - Execution worker / `ExecutionAgent` is not emitting events back to the SSE endpoint.
  - Check:
    - `/api/execution-sessions/run`
    - `ExecutionAgent` logic
    - Any code that POSTs to `/api/execution-sessions/[sessionId]/events`.

---

### 4. Sync client pipeline: `test-sync-command.js`

**Command:**

- `npm run debug:sync`
  - or `node scripts/debug/test-sync-command.js`

**What it does:**

1. `POST /api/sync/command`
   - Creates a new `SyncCommand` for `DEBUG_PROJECT_ID` with command `echo debug-sync`.
2. `POST /api/sync/command/:id/approve`
   - Transitions that command to `APPROVED` status.
3. `GET /api/sync/command?projectId=DEBUG_PROJECT_ID`
   - Emulates the sync client asking for the next command.

**Expected output (happy path):**

- Logs showing the command was created and approved.
- Final line similar to:
  - `Command received: { "id": "...", "command": "echo debug-sync", ... }`
- Exit code: `0`.

**If the sync pipeline is broken:**

- If `POST /api/sync/command` fails:
  - DB or project problem; check the route and `DEBUG_PROJECT_ID`.
- If approve endpoint fails:
  - Check `/api/sync/command/[id]/approve` and the command status transitions.
- If GET returns `command: null`:
  - Script prints `Empty response: no APPROVED command` with the full JSON payload.
  - This means:
    - Either the command is not in `APPROVED` status.
    - Or the `/api/sync/command` GET filtering/ordering is not surfacing it.

This script effectively tells you: **“The sync client can/cannot see approved commands for this project.”**

---

### 5. Suggested run order and diagnosis strategy

When Direct Execution Mode is not working, run these in order:

1. **Check DB state**
   - `npm run debug:db`
   - Confirms that projects, sessions, and commands exist at all.
2. **Check SSE flow**
   - `npm run debug:sse`
   - Confirms that sessions start and the SSE stream receives events after a user message.
3. **Check sync client visibility**
   - `npm run debug:sync`
   - Confirms that approved commands are visible to the sync client.

From the results you can say, for example:

- “DB is fine, SSE works, **but** sync client doesn’t see commands” → focus on `/api/sync/command` and approval logic.
- “DB shows no `ExecutionSession` rows even after UI actions” → UI is not calling `/api/execution-sessions/start` or that route is failing.
- “SSE never emits events” → focus on execution worker / `ExecutionAgent` and `/events` emission path.

---

### 6. If a script crashes

If any script exits with a stack trace or explicit error:

- Read the **HTTP status code** and **response body** printed by the script.
- Cross-check that:
  - `BASE_URL` points to the same instance where your UI is running.
  - `DEBUG_PROJECT_ID` actually exists in the DB (verify via `npm run debug:db`).
  - `DATABASE_URL` is correct and migrations are applied.
- Then inspect the corresponding API route in `app/api/**/route.ts` using the failing endpoint as the key.

