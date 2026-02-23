#!/usr/bin/env node

/**
 * Debug script: verify sync-client command visibility end-to-end.
 *
 * Flow:
 * 1) POST /api/sync/command   -> create a PENDING command for DEBUG_PROJECT_ID.
 * 2) POST /api/sync/command/:id/approve -> mark it APPROVED.
 * 3) GET  /api/sync/command?projectId=DEBUG_PROJECT_ID -> emulate sync client.
 *
 * Expected:
 *   - Response JSON has `command` non-null and matches the created command.
 *   - On success prints: "Command received: <id> <command>" and exits 0.
 *   - On failure prints a clear message and exits with non-zero.
 *
 * Config (env):
 *   BASE_URL         - base URL of the app (default: http://localhost:3000)
 *   DEBUG_PROJECT_ID - existing Project.id (REQUIRED)
 */

/* eslint-disable no-console */

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const DEBUG_PROJECT_ID = process.env.DEBUG_PROJECT_ID;

if (!DEBUG_PROJECT_ID) {
  console.error(
    "[test-sync-command] ERROR: DEBUG_PROJECT_ID is not set. " +
      "Run `node scripts/get-or-create-project.js` and export its `id` as DEBUG_PROJECT_ID.",
  );
  process.exit(1);
}

async function safeReadText(res) {
  try {
    return await res.text();
  } catch {
    return "<failed to read body>";
  }
}

async function createCommand() {
  const url = `${BASE_URL}/api/sync/command`;
  console.log(`[test-sync-command] Creating command via POST ${url}`);

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        projectId: DEBUG_PROJECT_ID,
        command: "echo debug-sync",
        reason: "E2E debug probe",
      }),
    });
  } catch (err) {
    console.error("[test-sync-command] Failed to call POST /api/sync/command:", err);
    process.exit(1);
  }

  if (!res.ok) {
    const bodyText = await safeReadText(res);
    console.error(
      `[test-sync-command] POST /api/sync/command returned ${res.status} ${res.statusText}. Body: ${bodyText}`,
    );
    process.exit(1);
  }

  const json = await res.json();
  if (!json.commandId) {
    console.error(
      "[test-sync-command] Response from POST /api/sync/command missing commandId:",
      json,
    );
    process.exit(1);
  }

  console.log(`[test-sync-command] Created command ${json.commandId}`);
  return json.commandId;
}

async function approveCommand(commandId) {
  const url = `${BASE_URL}/api/sync/command/${commandId}/approve`;
  console.log(`[test-sync-command] Approving command via POST ${url}`);

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (err) {
    console.error(
      "[test-sync-command] Failed to call POST /api/sync/command/:id/approve:",
      err,
    );
    process.exit(1);
  }

  if (!res.ok) {
    const bodyText = await safeReadText(res);
    console.error(
      `[test-sync-command] POST /api/sync/command/${commandId}/approve returned ${res.status} ${res.statusText}. Body: ${bodyText}`,
    );
    process.exit(1);
  }

  const json = await res.json();
  console.log(
    "[test-sync-command] Approve response:",
    JSON.stringify(json, null, 2),
  );
}

async function fetchApprovedCommand() {
  const url = `${BASE_URL}/api/sync/command?projectId=${encodeURIComponent(
    DEBUG_PROJECT_ID,
  )}`;
  console.log(`[test-sync-command] Fetching approved command via GET ${url}`);

  let res;
  try {
    res = await fetch(url, {
      method: "GET",
    });
  } catch (err) {
    console.error("[test-sync-command] Failed to call GET /api/sync/command:", err);
    process.exit(1);
  }

  if (!res.ok) {
    const bodyText = await safeReadText(res);
    console.error(
      `[test-sync-command] GET /api/sync/command returned ${res.status} ${res.statusText}. Body: ${bodyText}`,
    );
    process.exit(1);
  }

  const json = await res.json();
  return json;
}

async function main() {
  try {
    const commandId = await createCommand();
    await approveCommand(commandId);

    const json = await fetchApprovedCommand();

    if (!json || !json.command) {
      console.error(
        "[test-sync-command] Empty response: no APPROVED command returned from /api/sync/command.",
      );
      console.error(
        "[test-sync-command] Full JSON response:",
        JSON.stringify(json, null, 2),
      );
      process.exit(1);
    }

    console.log(
      "[test-sync-command] Command received:",
      JSON.stringify(
        {
          id: json.command.id,
          command: json.command.command,
          type: json.command.type,
          filePath: json.command.filePath,
        },
        null,
        2,
      ),
    );
    process.exit(0);
  } catch (err) {
    console.error(
      "[test-sync-command] Unexpected error:",
      err instanceof Error ? err.stack || err.message : err,
    );
    process.exit(1);
  }
}

main();

