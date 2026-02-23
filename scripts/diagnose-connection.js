#!/usr/bin/env node

/**
 * Debug Probe for Sync + Execution SSE
 *
 * Usage:
 *   node scripts/diagnose-connection.js
 *   node scripts/diagnose-connection.js --project-id YOUR_PROJECT_ID
 *   node scripts/diagnose-connection.js --base-url http://localhost:3002 --project-id YOUR_PROJECT_ID
 */

const DEFAULT_BASE_URL = "http://localhost:3002";
const DEFAULT_PROJECT_ID = "debug-probe-project";

const COLORS = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

function color(text, c) {
  return `${COLORS[c] || ""}${text}${COLORS.reset}`;
}

function parseArgs() {
  const args = process.argv.slice(2);
  let baseUrl = DEFAULT_BASE_URL;
  let projectId = DEFAULT_PROJECT_ID;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if ((arg === "--base-url" || arg === "--baseUrl") && args[i + 1]) {
      baseUrl = args[i + 1];
      i++;
    } else if (
      arg === "--project-id" ||
      arg === "--projectId" ||
      arg === "-p"
    && args[i + 1]
    ) {
      projectId = args[i + 1];
      i++;
    }
  }

  return { baseUrl: baseUrl.replace(/\/$/, ""), projectId };
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  let json = null;
  try {
    json = await res.json();
  } catch {
    // ignore JSON parse error, we'll still return status info
  }

  return { res, json };
}

async function checkHeartbeat(baseUrl, projectId) {
  const url = `${baseUrl}/api/sync/heartbeat`;
  console.log(color(`\n[1/3] Checking heartbeat: POST ${url}`, "cyan"));
  console.log(`Project ID: ${projectId}`);

  try {
    const { res, json } = await postJson(url, { projectId });

    console.log(`Status: ${res.status} ${res.statusText}`);
    console.log("Response JSON:", json);

    if (!res.ok) {
      console.error(
        color(
          `❌ Heartbeat request failed (HTTP ${res.status}).`,
          "red",
        ),
      );
      return false;
    }

    if (!json || !json.lastSeen) {
      console.warn(
        color(
          "⚠ Heartbeat responded 200 but lastSeen is missing.",
          "yellow",
        ),
      );
      return false;
    }

    console.log(
      color(
        `✅ Heartbeat OK, lastSeen: ${json.lastSeen}`,
        "green",
      ),
    );
    return true;
  } catch (error) {
    console.error(
      color(
        `❌ Heartbeat request error: ${error instanceof Error ? error.message : String(error)}`,
        "red",
      ),
    );
    return false;
  }
}

async function startExecutionSession(baseUrl, projectId) {
  const url = `${baseUrl}/api/execution-sessions/start`;
  console.log(color(`\n[2/3] Starting execution session: POST ${url}`, "cyan"));

  const body = {
    projectId,
    planId: "debug-probe-plan",
    autoApprove: false,
  };

  try {
    const { res, json } = await postJson(url, body);

    console.log(`Status: ${res.status} ${res.statusText}`);
    console.log("Response JSON:", json);

    if (!res.ok || !json || !json.sessionId) {
      console.error(
        color(
          `❌ Failed to start execution session (HTTP ${res.status}).`,
          "red",
        ),
      );
      return null;
    }

    console.log(
      color(`✅ Session started: ${json.sessionId}`, "green"),
    );
    return json.sessionId;
  } catch (error) {
    console.error(
      color(
        `❌ Error starting execution session: ${error instanceof Error ? error.message : String(error)}`,
        "red",
      ),
    );
    return null;
  }
}

async function sendChatMessage(baseUrl, projectId, sessionId, label = "") {
  const url = `${baseUrl}/api/execution-sessions/chat`;
  console.log(
    color(
      `\n[2.1${label ? ` ${label}` : ""}] Sending chat message: POST ${url}`,
      "cyan",
    ),
  );

  const body = {
    sessionId,
    projectId,
    message: "Debug probe test message from diagnose-connection.js",
  };

  try {
    const { res, json } = await postJson(url, body);

    console.log(`Status: ${res.status} ${res.statusText}`);
    console.log("Response JSON:", json);

    if (!res.ok) {
      console.error(
        color(
          `❌ Chat API request failed (HTTP ${res.status}).`,
          "red",
        ),
      );
      return false;
    }

    console.log(
      color("✅ Chat API responded OK", "green"),
    );
    return true;
  } catch (error) {
    console.error(
      color(
        `❌ Chat API error: ${error instanceof Error ? error.message : String(error)}`,
        "red",
      ),
    );
    return false;
  }
}

async function listenToSSE(baseUrl, sessionId, timeoutMs = 5000, onConnected) {
  const url = `${baseUrl}/api/execution-sessions/${sessionId}/events`;
  console.log(color(`\n[3/3] Checking SSE events: GET ${url}`, "cyan"));
  console.log(`Listening for ${timeoutMs / 1000}s...`);

  const controller = new AbortController();
  const events = [];
  let disconnected = false;

  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "text/event-stream",
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      console.error(
        color(
          `❌ SSE connection failed immediately (HTTP ${res.status}).`,
          "red",
        ),
      );
      clearTimeout(timer);
      return { events, disconnected: true };
    }

    if (!res.body || !res.body.getReader) {
      console.error(
        color("❌ Response body does not support streaming (no getReader).", "red"),
      );
      clearTimeout(timer);
      return { events, disconnected: true };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    let firstChunk = true;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        disconnected = true;
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      // Call onConnected callback after first chunk arrives (connection established)
      if (firstChunk) {
        firstChunk = false;
        if (typeof onConnected === "function") {
          try {
            await onConnected();
          } catch (error) {
            console.error(
              color(
                `Error in onConnected callback: ${
                  error instanceof Error ? error.message : String(error)
                }`,
                "red",
              ),
            );
          }
        }
      }

      // SSE events are separated by blank lines (\n\n)
      let boundaryIndex;
      while ((boundaryIndex = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, boundaryIndex);
        buffer = buffer.slice(boundaryIndex + 2);

        const lines = rawEvent
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);

        if (lines.length === 0) continue;

        const dataLines = lines
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trim());

        const eventData = dataLines.join("\n");
        if (eventData) {
          events.push(eventData);
          console.log(
            color("SSE event received:", "green"),
            eventData,
          );
        } else {
          console.log(color("SSE event (no data):", "yellow"), rawEvent);
        }
      }
    }
  } catch (error) {
    if (controller.signal.aborted) {
      // Normal timeout
    } else {
      console.error(
        color(
          `❌ SSE stream error: ${error instanceof Error ? error.message : String(error)}`,
          "red",
        ),
      );
      disconnected = true;
    }
  } finally {
    clearTimeout(timer);
  }

  if (events.length === 0) {
    console.error(
      color(
        "❌ No SSE events received within the timeout window.",
        "red",
      ),
    );
  } else {
    console.log(
      color(
        `✅ Received ${events.length} SSE event(s) within ${timeoutMs / 1000}s.`,
        "green",
      ),
    );
  }

  if (disconnected && events.length === 0) {
    console.error(
      color(
        "❌ SSE connection closed without delivering any events.",
        "red",
      ),
    );
  }

  return { events, disconnected };
}

async function main() {
  const { baseUrl, projectId } = parseArgs();

  console.log(
    color(
      `Running connection diagnostics against ${baseUrl} for projectId=${projectId}`,
      "cyan",
    ),
  );

  const heartbeatOk = await checkHeartbeat(baseUrl, projectId);

  const sessionId = await startExecutionSession(baseUrl, projectId);
  if (!sessionId) {
    console.error(
      color(
        "\n❌ Cannot continue diagnostics without a valid execution session.",
        "red",
      ),
    );
    process.exit(1);
  }

  // Open SSE first (как в браузере: сначала открывается EventSource, потом пользователь пишет сообщение)
  const { events } = await listenToSSE(
    baseUrl,
    sessionId,
    5000,
    async () => {
      // После установления SSE‑соединения отправляем тестовое сообщение
      await sendChatMessage(baseUrl, projectId, sessionId, "(after SSE connected)");
    },
  );

  console.log("\n=== Summary ===");
  console.log(
    `Heartbeat: ${heartbeatOk ? color("OK", "green") : color("FAILED", "red")}`,
  );
  console.log(
    `SSE events received: ${
      events.length > 0 ? color(String(events.length), "green") : color("0", "red")
    }`,
  );

  if (!heartbeatOk || events.length === 0) {
    console.error(
      color(
        "\n❌ Diagnostics detected potential connectivity issues. See logs above.",
        "red",
      ),
    );
    process.exit(1);
  }

  console.log(
    color(
      "\n✅ All diagnostics passed. Heartbeat, chat API, and SSE look healthy from this script.",
      "green",
    ),
  );
  process.exit(0);
}

main().catch((error) => {
  console.error(
    color(
      `❌ Unhandled error in diagnose-connection.js: ${error instanceof Error ? error.stack || error.message : String(error)}`,
      "red",
    ),
  );
  process.exit(1);
});

