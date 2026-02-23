"use client";

import React, { useEffect, useRef, useState } from "react";

type LogLevel = "info" | "error";

type LogEntry = {
  id: number;
  text: string;
  level: LogLevel;
};

export default function DebugConsolePage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const logIdRef = useRef(0);

  const pushLog = (text: string, level: LogLevel = "info") => {
    setLogs((prev) => [
      ...prev,
      {
        id: ++logIdRef.current,
        text,
        level,
      },
    ]);
  };

  const handleConnectSse = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setConnected(false);
    }

    try {
      const es = new EventSource("/api/debug/sse");
      eventSourceRef.current = es;

      es.onopen = () => {
        setConnected(true);
        pushLog("[SSE] Connected", "info");
      };

      es.onmessage = (event) => {
        pushLog(`[SSE] ${event.data}`, "info");
      };

      es.onerror = (event) => {
        pushLog("[SSE] Error (see console for details)", "error");
        // eslint-disable-next-line no-console
        console.error("SSE error:", event);
        setConnected(false);
      };
    } catch (error) {
      pushLog(
        `[SSE] Failed to connect: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "error",
      );
    }
  };

  const handleSendPing = async () => {
    try {
      const res = await fetch("/api/debug/ping", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const json = await res.json();
      if (!res.ok) {
        pushLog(
          `[PING] HTTP ${res.status}: ${JSON.stringify(json)}`,
          "error",
        );
        return;
      }

      pushLog(`[PING] ${JSON.stringify(json)}`, "info");
    } catch (error) {
      pushLog(
        `[PING] Failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "error",
      );
    }
  };

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Debug Console</h1>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleConnectSse}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {connected ? "Reconnect SSE" : "Connect SSE"}
        </button>

        <button
          type="button"
          onClick={handleSendPing}
          className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          Send Ping
        </button>
      </div>

      <div className="mt-2 flex-1 overflow-hidden rounded border border-neutral-800 bg-black">
        <div className="h-full overflow-y-auto p-3 font-mono text-sm text-green-400">
          {logs.length === 0 ? (
            <div className="text-neutral-500">
              Debug output will appear here…
            </div>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className={
                  log.level === "error" ? "text-red-400" : "text-green-400"
                }
              >
                {log.text}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

