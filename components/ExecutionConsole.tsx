"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Play,
  Pause,
  Square,
  Terminal,
  Send,
  Command,
  ChevronDown,
  ChevronUp,
  Bot,
  X,
  CircleDot,
  Clock,
  Check,
  Ban,
  Circle,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type CommandStatus = "PENDING" | "APPROVED" | "EXECUTING" | "COMPLETED" | "FAILED" | "REJECTED" | "SKIPPED";

interface SyncCommand {
  id: string;
  command: string;
  reason?: string | null;
  type: string;
  filePath?: string | null;
  fileContent?: string | null;
  status: CommandStatus;
  requiresApproval: boolean;
  stdout?: string | null;
  stderr?: string | null;
  exitCode?: number | null;
  createdAt: string;
}

type MessageType = "log" | "user" | "ai" | "command" | "error" | "system";

export interface ConsoleMessage {
  id: string;
  type: MessageType;
  content: string;
  timestamp: Date;
  metadata?: {
    commandId?: string;
    status?: CommandStatus;
    exitCode?: number;
    agentAction?: string;
    sendStatus?: "pending" | "sent" | "error";
    eventType?: string;
    data?: { taskId?: string; [key: string]: unknown };
  };
}

interface ExecutionConsoleProps {
  projectId: string;
  sessionId?: string;
  autoApprove?: boolean;
  onTaskUpdate?: (update: { taskId: string; status: string }) => void;
  onSessionStopped?: () => void;
  /** When provided, messages persist across Plan/Execute tab switches */
  messages?: ConsoleMessage[];
  onMessagesChange?: React.Dispatch<React.SetStateAction<ConsoleMessage[]>>;
  onReflexologistRun?: () => void;
}

interface ExecutionLog {
  id: string;
  sessionId: string;
  type: string;
  message: string;
  metadata?: any;
  createdAt: string;
}

function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function parseAnsiColors(text: string): React.ReactNode[] {
  const colors: Record<string, string> = {
    '30': 'text-black',
    '31': 'text-red-500',
    '32': 'text-green-500',
    '33': 'text-yellow-500',
    '34': 'text-blue-500',
    '35': 'text-magenta-500',
    '36': 'text-cyan-500',
    '37': 'text-white',
    '90': 'text-slate-500',
    '91': 'text-red-400',
    '92': 'text-green-400',
    '93': 'text-yellow-400',
    '94': 'text-blue-400',
    '95': 'text-magenta-400',
    '96': 'text-cyan-400',
    '97': 'text-slate-100',
  };

  const parts: { text: string; className: string }[] = [];
  let currentClass = "";
  let buffer = "";
  let i = 0;

  while (i < text.length) {
    if (text[i] === '\x1b' && text[i + 1] === '[') {
      if (buffer) {
        parts.push({ text: buffer, className: currentClass });
        buffer = "";
      }
      let j = i + 2;
      let code = "";
      while (j < text.length && /[0-9;]/.test(text[j])) {
        code += text[j];
        j++;
      }
      const codes = code.split(';').filter(Boolean);
      currentClass = "";
      for (const c of codes) {
        if (colors[c]) {
          currentClass += " " + colors[c];
        } else if (c === '1') {
          currentClass += " font-bold";
        } else if (c === '0') {
          currentClass = "";
        }
      }
      i = j;
    } else {
      buffer += text[i];
      i++;
    }
  }

  if (buffer) {
    parts.push({ text: buffer, className: currentClass });
  }

  return parts.map((part, idx) => (
    <span key={idx} className={part.className}>{part.text}</span>
  ));
}

function getMessageColorClass(content: string): string {
  const lowerContent = content.toLowerCase();
  
  if (lowerContent.startsWith('success:') || lowerContent.startsWith('done:')) {
    return 'text-green-400';
  }
  if (lowerContent.startsWith('error:') || lowerContent.startsWith('failed:')) {
    return 'text-red-400';
  }
  if (lowerContent.startsWith('warning:')) {
    return 'text-yellow-400';
  }
  if (lowerContent.startsWith('system:') || lowerContent.startsWith('info:')) {
    return 'text-slate-300';
  }
  
  return 'text-slate-300';
}

export default function ExecutionConsole({
  projectId,
  sessionId,
  autoApprove = false,
  onTaskUpdate,
  onSessionStopped,
  messages: externalMessages,
  onMessagesChange,
  onReflexologistRun,
}: ExecutionConsoleProps) {
  const [internalMessages, setInternalMessages] = useState<ConsoleMessage[]>([]);
  const messages = externalMessages ?? internalMessages;
  const setMessages: React.Dispatch<React.SetStateAction<ConsoleMessage[]>> =
    onMessagesChange ?? setInternalMessages;
  const setMessagesRef = useRef(setMessages);
  setMessagesRef.current = setMessages;
  const [commands, setCommands] = useState<SyncCommand[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>(sessionId);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [lastLogTimestamp, setLastLogTimestamp] = useState<string | null>(null);
  const [sessionStoppedTimestamp, setSessionStoppedTimestamp] = useState<Date | null>(null);
  const POLLING_DELAY_AFTER_STOP = 5000;
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<ConsoleMessage[]>([]);
  const fetchErrorShownRef = useRef(false);
  const systemMessagesShownRef = useRef(false);
  const router = useRouter();

  const syncAutostart =
    typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_SYNC_CLIENT_AUTOSTART === "true";

  const addMessage = useCallback((message: ConsoleMessage) => {
    setMessagesRef.current((prev) => [
      ...prev,
      {
        ...message,
        // Ensure a stable, unique key for React rendering
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${prev.length}`,
      },
    ]);
  }, []);

  const addSystemMessage = useCallback((content: string) => {
    addMessage({
      id: `sys-${Date.now()}`,
      type: "system",
      content,
      timestamp: new Date(),
    });
  }, [addMessage]);

  const STORAGE_KEY = (pid: string) => `executionConsole:${pid}`;
  const SYSTEM_FLAG_KEY = (pid: string) => `executionConsoleSystemShown:${pid}`;

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY(projectId));
      if (!raw) return;
      const parsed = JSON.parse(raw) as Array<
        Omit<ConsoleMessage, "timestamp"> & { timestamp: string }
      >;
      const restored: ConsoleMessage[] = parsed.map((m) => ({
        ...m,
        timestamp: new Date(m.timestamp),
      }));
      setMessagesRef.current(restored);
    } catch (error) {
      console.error("[ExecutionConsole] Failed to restore messages from storage:", error);
    }
  }, [projectId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const serializable = messages.map((m) => ({
        ...m,
        timestamp: m.timestamp.toISOString(),
      }));
      window.localStorage.setItem(STORAGE_KEY(projectId), JSON.stringify(serializable));
    } catch (error) {
      console.error("[ExecutionConsole] Failed to persist messages to storage:", error);
    }
  }, [messages, projectId]);

  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [messages, commands]);

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
      addSystemMessage(
        "Sync-client запускается автоматически сервером; статус подключения отражается в индикаторе Sync."
      );
    }
    systemMessagesShownRef.current = true;
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(SYSTEM_FLAG_KEY(projectId), "1");
      } catch {
        // ignore
      }
    }
  }, [addSystemMessage, syncAutostart, projectId]);

  useEffect(() => {
    setActiveSessionId(sessionId);
    if (sessionId) {
      setIsRunning(true);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!activeSessionId) {
      return;
    }

    let cancelled = false;
    fetchErrorShownRef.current = false;

    const fetchLogs = async () => {
      const shouldStopPolling = () => {
        if (sessionStoppedTimestamp) {
          const elapsed = Date.now() - sessionStoppedTimestamp.getTime();
          if (elapsed > POLLING_DELAY_AFTER_STOP) {
            return true;
          }
        }
        if (!sessionStoppedTimestamp && !activeSessionId) {
          return true;
        }
        return false;
      };

      if (cancelled || shouldStopPolling()) {
        return;
      }

      try {
        const params = lastLogTimestamp ? `?after=${encodeURIComponent(lastLogTimestamp)}` : "";
        const res = await fetch(`/api/execution-sessions/${activeSessionId}/logs${params}`);
        if (!res.ok) {
          if (!cancelled && !fetchErrorShownRef.current) {
            let errBody = "";
            try {
              errBody = await res.text();
              const parsed = JSON.parse(errBody);
              errBody = typeof parsed?.error === "string" ? parsed.error : errBody || res.statusText;
            } catch {
              errBody = res.statusText || "Failed to load logs";
            }
            addSystemMessage(`Failed to load logs: ${errBody}`);
            fetchErrorShownRef.current = true;
          }
          return;
        }

        const data: ExecutionLog[] = await res.json();
        console.log(data);

        if (cancelled || data.length === 0) return;

        const lastCreatedAt = data[data.length - 1]?.createdAt;
        const prev = messagesRef.current;
        const existingIds = new Set(prev.map((m) => m.id));
        const newMessages: ConsoleMessage[] = [];

        for (const log of data) {
          if (existingIds.has(log.id)) continue;

          const timestamp = new Date(log.createdAt);
          let type: MessageType = "log";
          const metadata: ConsoleMessage["metadata"] = {};

          switch (log.type) {
            case "user_message":
              type = "user";
              break;
            case "agent_message":
              type = "ai";
              if (log.metadata?.data?.action) {
                metadata.agentAction = log.metadata.data.action;
              }
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
            metadata.eventType = log.metadata.eventType;
            metadata.data = log.metadata.data;
          }

          newMessages.push({
            id: log.id,
            type,
            content: log.message,
            timestamp,
            metadata: Object.keys(metadata).length ? metadata : undefined,
          });
        }

        for (const m of newMessages) {
          const ev = m.metadata?.eventType;
          const taskId = m.metadata?.data?.taskId;
          const status = m.metadata?.data?.status;
          if (taskId && ev === "task_started") {
            onTaskUpdate?.({ taskId, status: "IN_PROGRESS" });
          } else if (taskId && ev === "task_qa_completed" && typeof status === "string") {
            onTaskUpdate?.({ taskId, status });
          } else if (ev === "session_stopped") {
            setSessionStoppedTimestamp(new Date());
            setIsRunning(false);
            setIsPaused(false);
            onSessionStopped?.();
          } else if (ev === "reflexologist_run") {
            onReflexologistRun?.();
          }
        }

        if (newMessages.length > 0) {
          setMessagesRef.current((p) => [...p, ...newMessages]);
          router.refresh();
        }

        if (lastCreatedAt && (!lastLogTimestamp || lastCreatedAt > lastLogTimestamp)) {
          setLastLogTimestamp(lastCreatedAt);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("[ExecutionConsole] Failed to fetch logs:", error);
          if (!fetchErrorShownRef.current) {
            addSystemMessage("Failed to load logs. Check network and try again.");
            fetchErrorShownRef.current = true;
          }
        }
      }
    };

    // initial fetch
    fetchLogs();
    const interval = setInterval(fetchLogs, 1000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeSessionId, lastLogTimestamp, sessionStoppedTimestamp, onTaskUpdate, onSessionStopped, addSystemMessage]);

  const handleStart = async () => {
    if (sessionId) {
      addSystemMessage("Execution session is already provided by parent component.");
      return;
    }

    setIsRunning(true);
    addSystemMessage("Starting execution session...");
    try {
      const response = await fetch("/api/execution-sessions/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          sessionId,
          autoApprove,
          executionMode: "local",
        }),
      });
      if (response.ok) {
        const data = await response.json();
        setActiveSessionId(data.sessionId);
        addSystemMessage(`Session started: ${data.sessionId}`);
      } else {
        addSystemMessage("Failed to start session");
      }
    } catch (error) {
      addSystemMessage(`Error starting session: ${error}`);
    }
  };

  const handlePause = async () => {
    setIsPaused(true);
    if (activeSessionId) {
      await fetch(`/api/execution-sessions/${activeSessionId}/pause`, { method: "POST" });
      addSystemMessage("Execution paused");
    }
  };

  const handleResume = async () => {
    setIsPaused(false);
    if (activeSessionId) {
      await fetch(`/api/execution-sessions/${activeSessionId}/resume`, { method: "POST" });
      addSystemMessage("Execution resumed");
    }
  };

  const handleStop = async () => {
    setIsRunning(false);
    setIsPaused(false);
    if (activeSessionId) {
      await fetch(`/api/execution-sessions/${activeSessionId}/stop`, { method: "POST" });
      setActiveSessionId(undefined);
    }
    addSystemMessage("Execution stopped");
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    const message = inputValue.trim();

    if (!activeSessionId) {
      addSystemMessage(
        "Нет активной execution-сессии. Сначала запустите Auto Execution, затем отправляйте сообщения."
      );
      return;
    }

    // Отобразить сообщение пользователя сразу в консоли
    addMessage({
      id: `user-${Date.now()}`,
      type: "user",
      content: message,
      timestamp: new Date(),
    });

    setInputValue("");
    inputRef.current?.focus();

    try {
      const response = await fetch("/api/execution-sessions/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: activeSessionId, message, projectId }),
      });
      if (!response.ok) {
        addMessage({
          id: `error-${Date.now()}`,
          type: "error",
          content: `Error sending (status ${response.status})`,
          timestamp: new Date(),
        });
      }
    } catch (error) {
      addMessage({
        id: `error-${Date.now()}`,
        type: "error",
        content: `Error sending: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date(),
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const getStatusIcon = (status: CommandStatus) => {
    switch (status) {
      case "PENDING":
        return <Clock className="h-3.5 w-3.5" />;
      case "APPROVED":
      case "EXECUTING":
        return <Play className="h-3.5 w-3.5" />;
      case "COMPLETED":
        return <Check className="h-3.5 w-3.5" />;
      case "FAILED":
        return <X className="h-3.5 w-3.5" />;
      case "REJECTED":
        return <Ban className="h-3.5 w-3.5" />;
      default:
        return <Circle className="h-3.5 w-3.5" />;
    }
  };

  const getStatusColor = (status: CommandStatus): string => {
    switch (status) {
      case "PENDING": return "text-yellow-500";
      case "APPROVED": return "text-blue-400";
      case "EXECUTING": return "text-cyan-400 animate-pulse";
      case "COMPLETED": return "text-green-400";
      case "FAILED": return "text-red-400";
      case "REJECTED": return "text-orange-400";
      default: return "text-slate-400";
    }
  };

  const commonCommands = [
    { label: "Run tests", cmd: "npm test" },
    { label: "Build project", cmd: "npm run build" },
    { label: "Start dev", cmd: "npm run dev" },
    { label: "Lint code", cmd: "npm run lint" },
    { label: "Install deps", cmd: "npm install" },
  ];

  const renderMessage = (msg: ConsoleMessage) => {
    const time = formatTimestamp(msg.timestamp);

    switch (msg.type) {
      case "user":
        return (
          <div key={msg.id} className="flex gap-2">
            <span className="text-slate-500 select-none w-20 flex-shrink-0">[{time}]</span>
            <span className="flex items-center gap-1 text-green-400">
              <User className="h-3.5 w-3.5" />
              User:
            </span>
            <span className="text-green-300">
              {msg.content}
              {msg.metadata?.sendStatus === "error" && (
                <span className="ml-2 text-xs text-red-400">(Error sending)</span>
              )}
            </span>
          </div>
        );
      case "ai":
        return (
          <div key={msg.id} className="flex gap-2">
            <span className="text-slate-500 select-none w-20 flex-shrink-0">[{time}]</span>
            <span className="flex items-center gap-1 text-blue-400">
              <Bot className="h-3.5 w-3.5" />
              AI:
            </span>
            <span className="text-blue-300">{msg.content}</span>
          </div>
        );
      case "error":
        return (
          <div key={msg.id} className="flex gap-2">
            <span className="text-slate-500 select-none w-20 flex-shrink-0">[{time}]</span>
            <span className="flex items-center gap-1 text-red-400">
              <X className="h-3.5 w-3.5" />
              Error:
            </span>
            <span className="text-red-300">{msg.content}</span>
          </div>
        );
      case "system":
        return (
          <div key={msg.id} className="flex gap-2">
            <span className="text-slate-500 select-none w-20 flex-shrink-0">[{time}]</span>
            <span className="flex items-center gap-1 text-purple-400">
              <CircleDot className="h-3.5 w-3.5" />
              System:
            </span>
            <span className="text-purple-300">{msg.content}</span>
          </div>
        );
      case "command":
        return (
          <div key={msg.id} className="flex gap-2">
            <span className="text-slate-500 select-none w-20 flex-shrink-0">[{time}]</span>
            <span
              className={`flex items-center gap-1 ${
                msg.metadata?.status ? getStatusColor(msg.metadata.status) : "text-slate-400"
              }`}
            >
              {msg.metadata?.status ? getStatusIcon(msg.metadata.status) : <Terminal className="h-3.5 w-3.5" />}{" "}
              Command:
            </span>
            <span className="text-slate-300">{msg.content}</span>
          </div>
        );
      case "log":
        const logColorClass = getMessageColorClass(msg.content);
        return (
          <div key={msg.id} className="flex gap-2">
            <span className="text-slate-500 select-none w-20 flex-shrink-0">[{time}]</span>
            <span className={logColorClass}>{msg.content}</span>
          </div>
        );
      default: {
        let displayContent = msg.content;
        const ev = msg.metadata?.eventType;
        const data = msg.metadata?.data;
        if (ev === "task_started" && data?.title) {
          displayContent = `Task started: ${data.title}`;
        } else if (ev === "task_completed" && data?.title) {
          const status = data.success === true ? " (success)" : data.success === false ? " (failed)" : "";
          displayContent = `Task completed: ${data.title}${status}`;
        }
        return (
          <div key={msg.id} className="flex gap-2">
            <span className="text-slate-500 select-none w-20 flex-shrink-0">[{time}]</span>
            <span className="text-slate-400">{displayContent}</span>
          </div>
        );
      }
    }
  };

  const canSend = !!activeSessionId;

  return (
    <div className="h-full min-h-0 flex flex-col bg-[#1e1e1e] rounded-lg overflow-hidden border border-slate-700">
      <div className="flex items-center justify-between px-3 py-2 bg-[#252526] border-b border-[#3c3c3c]">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-slate-400" />
          <span className="text-sm text-slate-300">TERMINAL</span>
          {isRunning && (
            <Badge variant="outline" className="bg-green-900/30 border-green-700 text-green-400 text-xs">
              <span className="w-2 h-2 rounded-full bg-green-400 mr-1.5 animate-pulse" />
              Running
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-slate-400 hover:text-white hover:bg-slate-700"
            onClick={() => setShowCommandPalette(!showCommandPalette)}
          >
            <Command className="h-4 w-4 mr-1" />
            <span className="text-xs">Commands</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-slate-400 hover:text-white"
            onClick={isRunning ? (isPaused ? handleResume : handlePause) : handleStart}
            title={isRunning ? (isPaused ? "Resume" : "Pause") : "Start"}
          >
            {isRunning ? (isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />) : <Play className="h-4 w-4" />}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-slate-400 hover:text-red-400"
            onClick={handleStop}
            disabled={!isRunning}
            title="Stop"
          >
            <Square className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {showCommandPalette && (
        <div className="bg-[#252526] border-b border-[#3c3c3c] px-2 py-2">
          <p className="text-xs text-slate-500 mb-2 px-1">Quick Commands</p>
          <div className="flex flex-wrap gap-1">
            {commonCommands.map((cmd) => (
              <button
                key={cmd.cmd}
                onClick={() => setInputValue(cmd.cmd)}
                className="px-2 py-1 text-xs bg-[#3c3c3c] text-slate-300 rounded hover:bg-[#4c4c4c] transition-colors"
              >
                {cmd.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div
        ref={logsContainerRef}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden"
      >
        <div className="p-2.5 space-y-1 font-mono text-xs leading-snug">
          {messages.map(renderMessage)}
        </div>
      </div>

      <div className="border-t border-[#3c3c3c] bg-[#1e1e1e] p-2">
        <div className="flex items-center gap-2 bg-[#252526] rounded px-3 py-1.5 border border-[#3c3c3c] focus-within:border-blue-500 transition-colors">
          <span className="text-green-400 text-sm font-mono">{">"}</span>
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              canSend
                ? "Enter message to AI..."
                : "Start Auto Execution to chat with AI..."
            }
            className="flex-1 bg-transparent text-slate-200 placeholder-slate-500 text-sm font-mono focus:outline-none"
            disabled={!canSend}
          />
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-slate-400 hover:text-white"
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || !canSend}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
