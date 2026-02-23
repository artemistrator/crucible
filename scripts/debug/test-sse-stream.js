#!/usr/bin/env node

/**
 * Debug script: verify ExecutionSession SSE stream end-to-end.
 *
 * Flow:
 * 1) POST /api/execution-sessions/start to create a fake session.
 * 2) Open SSE stream:   GET /api/execution-sessions/:sessionId/events
 * 3) POST /api/execution-sessions/chat with message "Ping".
 * 4) Log every received SSE event, or print TIMEOUT after 5 seconds.
 *
 * Config (env):
 *   BASE_URL         - base URL of the app (default: http://localhost:3000)
 *   DEBUG_PROJECT_ID - existing Project.id to attach the session to (REQUIRED)
 */

/* eslint-disable no-console */

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const DEBUG_PROJECT_ID = process.env.DEBUG_PROJECT_ID;

if (!DEBUG_PROJECT_ID) {
  console.error(
    "[test-sse-stream] ERROR: DEBUG_PROJECT_ID is not set. " +
      "Run `node scripts/get-or-create-project.js` and export its `id` as DEBUG_PROJECT_ID.",
  );
  process.exit(1);
}

async function startSession() {
  const url = `${BASE_URL}/api/execution-sessions/start`;
  console.log(`[test-sse-stream] Starting execution session via POST ${url}`);

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        projectId: DEBUG_PROJECT_ID,
        planId: null,
        costLimit: null,
        autoApprove: true,
      }),
    });
  } catch (err) {
    console.error("[test-sse-stream] Failed to call /start:", err);
    process.exit(1);
  }

  if (!res.ok) {
    const bodyText = await safeReadText(res);
    console.error(
      `[test-sse-stream] /start returned ${res.status} ${res.statusText}. Body: ${bodyText}`,
    );
    process.exit(1);
  }

  const json = await res.json();
  if (!json.sessionId) {
    console.error("[test-sse-stream] /start response missing sessionId:", json);
    process.exit(1);
  }

  console.log(
    `[test-sse-stream] Started session ${json.sessionId} for project ${DEBUG_PROJECT_ID}`,
  );

  return json.sessionId;
}

async function sendChat(sessionId) {
  const url = `${BASE_URL}/api/execution-sessions/chat`;
  console.log(`[test-sse-stream] Sending chat Ping via POST ${url}`);

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionId,
        projectId: DEBUG_PROJECT_ID,
        message: "Ping",
      }),
    });
  } catch (err) {
    console.error("[test-sse-stream] Failed to call /chat:", err);
    return;
  }

  if (!res.ok) {
    const bodyText = await safeReadText(res);
    console.error(
      `[test-sse-stream] /chat returned ${res.status} ${res.statusText}. Body: ${bodyText}`,
    );
    return;
  }

  console.log("[test-sse-stream] Chat POST accepted.");
}

async function safeReadText(res) {
  try {
    return await res.text();
  } catch {
    return "<failed to read body>";
  }
}

/**
 * Simple SSE parser for Node fetch streams.
 * We only care about lines that start with "data:".
 */
async function watchSse(sessionId) {
  const controller = new AbortController();
  const timeoutMs = 5000;
  let receivedAnyEvent = false;

  const url = `${BASE_URL}/api/execution-sessions/${sessionId}/events`;
  console.log(`[test-sse-stream] Connecting to SSE via GET ${url}`);

  const timeout = setTimeout(() => {
    console.log(
      `[test-sse-stream] TIMEOUT: no SSE events received within ${timeoutMs}ms (aborting connection)`,
    );
    controller.abort();
  }, timeoutMs);

  let res;
  try {
    res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "text/event-stream",
      },
    });
  } catch (err) {
    clearTimeout(timeout);
    console.error("[test-sse-stream] Failed to open SSE stream:", err);
    process.exit(1);
  }

  if (!res.ok || !res.body) {
    clearTimeout(timeout);
    const bodyText = await safeReadText(res);
    console.error(
      `[test-sse-stream] SSE GET returned ${res.status} ${res.statusText}. Body: ${bodyText}`,
    );
    process.exit(1);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  console.log("[test-sse-stream] SSE stream connected. Waiting for events...");

  // Send chat after the SSE connection is established.
  void sendChat(sessionId);

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        const lines = rawEvent.split("\n");
        const dataLines = lines
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.replace(/^data:\s*/, ""));

        if (dataLines.length === 0) {
          continue;
        }

        const dataStr = dataLines.join("\n");
        try {
          const event = JSON.parse(dataStr);
          receivedAnyEvent = true;
          console.log(
            "[test-sse-stream] Event:",
            JSON.stringify(
              {
                type: event.type,
                timestamp: event.timestamp,
                data: event.data,
              },
              null,
              2,
            ),
          );
        } catch (err) {
          console.log(
            "[test-sse-stream] Non-JSON SSE data:",
            JSON.stringify(dataStr),
            "error:",
            err instanceof Error ? err.message : String(err),
          );
        }
      }
    }
  } catch (err) {
    if (controller.signal.aborted) {
      // Expected when timeout fires.
    } else {
      console.error("[test-sse-stream] Error while reading SSE stream:", err);
    }
  } finally {
    clearTimeout(timeout);
  }

  if (receivedAnyEvent) {
    console.log("[test-sse-stream] SSE stream OK (received at least one event).");
    process.exit(0);
  } else {
    console.log(
      "[test-sse-stream] TIMEOUT: SSE stream connected but no data events were received.",
    );
    process.exit(1);
  }
}

async function main() {
  try {
    const sessionId = await startSession();
    await watchSse(sessionId);
  } catch (err) {
    console.error(
      "[test-sse-stream] Unexpected error:",
      err instanceof Error ? err.stack || err.message : err,
    );
    process.exit(1);
  }
}

main();

