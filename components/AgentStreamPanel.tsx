"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getExecutorDisplayLabel } from "@/lib/agent-display";
import type { ConsoleMessage } from "@/components/ExecutionConsole";

interface ExecutionLog {
  id: string;
  sessionId: string;
  type: string;
  message: string;
  metadata?: { eventType?: string; data?: { taskId?: string; status?: string; [key: string]: unknown } };
  createdAt: string;
}

export interface AgentStreamPanelProps {
  projectId: string;
  sessionId?: string;
  autoApprove?: boolean;
  onTaskUpdate?: (update: { taskId: string; status: string }) => void;
  onSessionStopped?: () => void;
  messages?: ConsoleMessage[];
  onMessagesChange?: React.Dispatch<React.SetStateAction<ConsoleMessage[]>>;
  onReflexologistRun?: () => void;
  /** When true, use smaller height and start collapsed to avoid extra scroll when embedded in project canvas */
  embeddedCompact?: boolean;
}

const PANEL_OPEN_HEIGHT = 230;
const PANEL_OPEN_HEIGHT_COMPACT = 140;
const PANEL_HEADER_HEIGHT = 40;

const syncAutostart =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_SYNC_CLIENT_AUTOSTART === "true";

const STORAGE_KEY = (pid: string) => `executionConsole:${pid}`;
const SYSTEM_FLAG_KEY = (pid: string) => `executionConsoleSystemShown:${pid}`;

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function AgentStreamPanel({
  projectId,
  sessionId,
  onTaskUpdate,
  onSessionStopped,
  onReflexologistRun,
  messages: externalMessages,
  onMessagesChange,
  embeddedCompact = false,
}: AgentStreamPanelProps) {
  const [internalMessages, setInternalMessages] = useState<ConsoleMessage[]>([]);
  const messages = externalMessages ?? internalMessages;
  const setMessages = onMessagesChange ?? setInternalMessages;
  const setMessagesRef = useRef(setMessages);
  setMessagesRef.current = setMessages;
  const [isExpanded, setIsExpanded] = useState(true);
  const panelOpenHeight = embeddedCompact ? PANEL_OPEN_HEIGHT_COMPACT : PANEL_OPEN_HEIGHT;
  const [lastLogTimestamp, setLastLogTimestamp] = useState<string | null>(null);
  const [sessionStoppedTimestamp, setSessionStoppedTimestamp] = useState<Date | null>(null);
  const [inputValue, setInputValue] = useState("");
  const messagesRef = useRef<ConsoleMessage[]>([]);
  const fetchErrorShownRef = useRef(false);
  const systemMessagesShownRef = useRef(false);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const POLLING_DELAY_AFTER_STOP = 5000;

  const addMessage = useCallback((message: ConsoleMessage) => {
    setMessagesRef.current((prev) => [
      ...prev,
      { ...message, id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${prev.length}` },
    ]);
  }, []);

  const addSystemMessage = useCallback((content: string) => {
    addMessage({ id: `sys-${Date.now()}`, type: "system", content, timestamp: new Date() });
  }, [addMessage]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY(projectId));
      if (!raw) return;
      const parsed = JSON.parse(raw) as Array<Omit<ConsoleMessage, "timestamp"> & { timestamp: string }>;
      const restored: ConsoleMessage[] = parsed.map((m) => ({ ...m, timestamp: new Date(m.timestamp) }));
      setMessagesRef.current(restored);
    } catch {
      // ignore
    }
  }, [projectId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const serializable = messages.map((m) => ({ ...m, timestamp: m.timestamp.toISOString() }));
      window.localStorage.setItem(STORAGE_KEY(projectId), JSON.stringify(serializable));
    } catch {
      // ignore
    }
  }, [messages, projectId]);

  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (systemMessagesShownRef.current) return;
    let alreadyShown = false;
    if (typeof window !== "undefined") {
      try {
        alreadyShown = window.localStorage.getItem(SYSTEM_FLAG_KEY(projectId)) === "1";
      } catch {
        alreadyShown = false;
      }
    }
    if (alreadyShown) {
      systemMessagesShownRef.current = true;
      return;
    }
    addSystemMessage(
      "Execution console: общение с AI-агентом и лог выполнения задач. Это не интерактивный shell — системные команды выполняются через sync-client автоматически."
    );
    if (!syncAutostart) {
      addSystemMessage(
        "Чтобы запускать sync-client вручную, используйте терминал на своей машине (см. Download Kit / README) и команду `node sync-client.js` в корне кита."
      );
    } else {
      addSystemMessage("Sync-client запускается автоматически сервером; статус подключения отражается в индикаторе Sync.");
    }
    systemMessagesShownRef.current = true;
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(SYSTEM_FLAG_KEY(projectId), "1");
      } catch {
        // ignore
      }
    }
  }, [addSystemMessage, projectId]);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    fetchErrorShownRef.current = false;

    const fetchLogs = async () => {
      if (sessionStoppedTimestamp && Date.now() - sessionStoppedTimestamp.getTime() > POLLING_DELAY_AFTER_STOP) return;
      if (cancelled) return;
      try {
        const params = lastLogTimestamp ? `?after=${encodeURIComponent(lastLogTimestamp)}` : "";
        const res = await fetch(`/api/execution-sessions/${sessionId}/logs${params}`);
        if (!res.ok) {
          if (!cancelled && !fetchErrorShownRef.current) {
            addSystemMessage("Failed to load logs.");
            fetchErrorShownRef.current = true;
          }
          return;
        }
        const data: ExecutionLog[] = await res.json();
        if (cancelled || data.length === 0) return;

        const lastCreatedAt = data[data.length - 1]?.createdAt;
        const prev = messagesRef.current;
        const existingIds = new Set(prev.map((m) => m.id));
        const newMessages: ConsoleMessage[] = [];

        for (const log of data) {
          if (existingIds.has(log.id)) continue;
          let type: ConsoleMessage["type"] = "log";
          const metadata: ConsoleMessage["metadata"] = {};
          switch (log.type) {
            case "user_message":
              type = "user";
              break;
            case "agent_message":
              type = "ai";
              if (log.metadata?.data?.action) (metadata as any).agentAction = log.metadata.data.action;
              break;
            case "command":
              type = "command";
              break;
            case "error":
              type = "error";
              break;
            default:
              type = "log";
          }
          if (log.metadata) {
            (metadata as any).eventType = log.metadata.eventType;
            (metadata as any).data = log.metadata.data;
          }
          newMessages.push({
            id: log.id,
            type,
            content: log.message,
            timestamp: new Date(log.createdAt),
            metadata: Object.keys(metadata).length ? metadata : undefined,
          });
        }

        for (const m of newMessages) {
          const ev = m.metadata?.eventType;
          const taskId = m.metadata?.data?.taskId;
          const status = m.metadata?.data?.status;
          if (taskId && ev === "task_started") onTaskUpdate?.({ taskId, status: "IN_PROGRESS" });
          else if (taskId && ev === "task_qa_completed" && typeof status === "string") onTaskUpdate?.({ taskId, status });
          else if (ev === "session_stopped") {
            setSessionStoppedTimestamp(new Date());
            onSessionStopped?.();
          } else if (ev === "reflexologist_run") onReflexologistRun?.();
        }

        if (newMessages.length > 0) {
          setMessagesRef.current((p) => [...p, ...newMessages]);
          router.refresh();
        }
        if (lastCreatedAt && (!lastLogTimestamp || lastCreatedAt > lastLogTimestamp)) {
          setLastLogTimestamp(lastCreatedAt);
        }
      } catch {
        if (!cancelled && !fetchErrorShownRef.current) {
          addSystemMessage("Failed to load logs. Check network and try again.");
          fetchErrorShownRef.current = true;
        }
      }
    };

    fetchLogs();
    const interval = setInterval(fetchLogs, 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sessionId, lastLogTimestamp, sessionStoppedTimestamp, onTaskUpdate, onSessionStopped, onReflexologistRun, addSystemMessage, router]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || !sessionId) return;
    const message = inputValue.trim();
    addMessage({ id: `user-${Date.now()}`, type: "user", content: message, timestamp: new Date() });
    setInputValue("");
    try {
      const response = await fetch("/api/execution-sessions/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message, projectId }),
      });
      if (!response.ok) {
        addMessage({ id: `err-${Date.now()}`, type: "error", content: `Error sending (${response.status})`, timestamp: new Date() });
      }
    } catch (error) {
      addMessage({
        id: `err-${Date.now()}`,
        type: "error",
        content: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
      });
    }
  };

  const progressPercent = 100; // could be derived from tasks/cost later

  // Row type styles per spec: system, agent, thought, action, output (light/dark theme)
  const rowPad = "px-4 py-1";
  const textRow = "text-xs leading-relaxed";

  const renderRow = (msg: ConsoleMessage) => {
    const iconSize = "13px";

    if (msg.type === "system") {
      return (
        <div key={msg.id} className={`flex items-center gap-2 ${rowPad}`}>
          <span style={{ fontSize: iconSize }}>⚙</span>
          <span className={`${textRow} italic text-slate-600 dark:text-slate-400`}>{msg.content}</span>
        </div>
      );
    }
    if (msg.type === "ai") {
      const isThought = (msg.metadata as any)?.agentAction === "thought" || /^\[thought\]/i.test(msg.content);
      if (isThought) {
        return (
          <div key={msg.id} className={`flex items-center gap-2 ${rowPad} bg-violet-50 dark:bg-[#1a1035]`}>
            <span style={{ fontSize: iconSize }}>💭</span>
            <span className={`${textRow} italic text-violet-700 dark:text-violet-400`}>{msg.content}</span>
          </div>
        );
      }
      return (
        <div key={msg.id} className={`flex items-center gap-2 ${rowPad} bg-blue-50 dark:bg-[#0f2044]`}>
          <span style={{ fontSize: iconSize }}>🤖</span>
          <span className={`${textRow} font-bold text-blue-600 dark:text-blue-400`}>Agent</span>
          <span className={`${textRow} text-emerald-700 dark:text-emerald-400`}>{msg.content}</span>
        </div>
      );
    }
    if (msg.type === "command") {
      return (
        <div key={msg.id} className={`flex items-center gap-2 ${rowPad} bg-emerald-50 dark:bg-[#0a2010]`}>
          <span style={{ fontSize: iconSize }}>▶</span>
          <span className={`${textRow} font-mono text-emerald-700 dark:text-emerald-400`}>{msg.content}</span>
        </div>
      );
    }
    if (msg.type === "user") {
      return (
        <div key={msg.id} className={`flex items-center gap-2 ${rowPad}`}>
          <span style={{ fontSize: iconSize }}>👤</span>
          <span className={`${textRow} text-slate-600 dark:text-slate-400`}>{msg.content}</span>
        </div>
      );
    }
    if (msg.type === "error") {
      return (
        <div key={msg.id} className={`flex items-center gap-2 ${rowPad}`}>
          <span style={{ fontSize: iconSize }}>⚠</span>
          <span className={`${textRow} text-red-600 dark:text-red-400`}>{msg.content}</span>
        </div>
      );
    }
    return (
      <div key={msg.id} className={`flex items-center gap-2 ${rowPad}`}>
        <span style={{ fontSize: iconSize }}>↪</span>
        <span className={`${textRow} font-mono text-slate-500 dark:text-slate-500`}>{msg.content}</span>
      </div>
    );
  };

  return (
    <div
      className="flex flex-shrink-0 min-h-0 flex-col overflow-hidden rounded-none border-t border-slate-200 bg-slate-100 dark:border-[#131929] dark:bg-[#0b0f18]"
      style={{
        height: isExpanded ? panelOpenHeight : PANEL_HEADER_HEIGHT,
        minHeight: isExpanded ? panelOpenHeight : PANEL_HEADER_HEIGHT,
        transition: "height 0.3s ease",
      }}
    >
      {/* Header bar: always visible; collapse = hide content down to this bar only */}
      <div
        className="flex flex-shrink-0 items-center justify-between border-b border-slate-200 bg-slate-100 px-3 dark:border-[#131929] dark:bg-[#0b0f18]"
        style={{ height: PANEL_HEADER_HEIGHT, minHeight: PANEL_HEADER_HEIGHT }}
      >
        <div className="flex items-center gap-2">
          <span style={{ fontSize: "13px" }}>🧠</span>
          <span className="font-mono text-[11px] font-bold tracking-widest text-slate-500 dark:text-slate-400">
            AGENT STREAM
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded border border-violet-300 bg-violet-100 px-2 py-0.5 font-mono text-[10px] text-violet-700 dark:border-[#4c1d95] dark:bg-[#1a1035] dark:text-violet-400">
            {getExecutorDisplayLabel("TASK_EXECUTOR")}
          </span>
          <span className="rounded border border-amber-300 bg-amber-100 px-2 py-0.5 font-mono text-[10px] text-amber-800 dark:border-[#92400e] dark:bg-[#1c1008] dark:text-amber-400">
            {progressPercent}%
          </span>
          <button
            type="button"
            onClick={() => setIsExpanded((e) => !e)}
            className="ml-2 flex h-6 w-6 items-center justify-center rounded text-slate-500 hover:bg-slate-200 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-200"
            aria-label={isExpanded ? "Свернуть" : "Развернуть"}
          >
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* When expanded: log (scrollable) + input fixed at bottom */}
      {isExpanded && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div
            ref={logsContainerRef}
            className="agent-stream-log-area min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-white py-2.5 dark:bg-[#090d14]"
          >
            <div className="space-y-0">
              {messages.map(renderRow)}
            </div>
            {messages.length === 0 && (
              <div className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400">
                Start Auto Execution to see agent stream.
              </div>
            )}
          </div>
          <div className="flex flex-shrink-0 items-center gap-2 border-t border-slate-200 bg-slate-100 px-3 py-2 dark:border-[#131929] dark:bg-[#0b0f18]">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder={sessionId ? "Message to AI..." : "Start Auto Execution to chat..."}
              disabled={!sessionId}
              className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 py-1.5 font-mono text-xs text-slate-800 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none dark:border-[#1e2535] dark:bg-[#090d14] dark:text-slate-200 dark:placeholder:text-slate-500 dark:focus:border-[#334155]"
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || !sessionId}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
