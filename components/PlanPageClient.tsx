"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Play,
  GitGraph,
  Square,
  Shield,
  DollarSign,
  RefreshCw,
  PlayCircle,
  Folder,
  FileText,
  ListChecks,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  CheckSquare,
  Brain,
  Pause,
  Check,
  Circle,
  Palette,
  Bot,
  Settings,
  Monitor,
  CheckCircle,
  Clock,
  ArrowUp,
  Send,
  Loader2,
} from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { getExecutorDisplayLabel } from "@/lib/agent-display";
import { deriveExecutionStateFromLogs } from "@/lib/execution-state-from-logs";
import { TaskListClient } from "@/components/TaskListClient";
import { TimelineView } from "@/components/TimelineView";
import { type ConsoleMessage } from "@/components/ExecutionConsole";
import AgentStreamPanel from "@/components/AgentStreamPanel";
import StartExecutionModal from "@/components/StartExecutionModal";
import ProjectTicketsTab from "@/components/ProjectTicketsTab";
import { SyncStatusIndicator } from "@/components/SyncStatus";
import { TaskDetailSheet } from "@/components/TaskDetailSheet";
import { InsightsPanel } from "@/components/InsightsPanel";
import { SessionSummaryModal } from "@/components/SessionSummaryModal";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { TaskDetail } from "./TaskDetailSheet";

export type TaskStatus = "TODO" | "IN_PROGRESS" | "REVIEW" | "DONE" | "WAITING_APPROVAL" | "REJECTED";

interface PlanPageClientProps {
  projectId: string;
  planId: string;
  tasks: TaskDetail[];
  aiProvider?: string | null;
  aiModel?: string | null;
  /** When set, show "К планам" in header and call on back (embedded in project canvas) */
  onBackToPlans?: () => void;
  /** When true, use compact layout (e.g. smaller agent panel) to avoid extra scroll */
  embeddedInCanvas?: boolean;
}

type ExecutionMode = "local" | "cloud";
type ExecutionEngine = "legacy" | "ahp";

const statusColors: Record<TaskStatus, string> = {
  TODO: "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200",
  IN_PROGRESS: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-200",
  REVIEW: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200",
  WAITING_APPROVAL:
    "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-200",
  DONE: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200",
  REJECTED: "border-red-200 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950 dark:text-red-200",
};

const statusDotClasses: Record<TaskStatus, string> = {
  TODO: "bg-slate-400",
  IN_PROGRESS: "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.7)]",
  REVIEW: "bg-violet-400 shadow-[0_0_6px_rgba(167,139,250,0.7)]",
  WAITING_APPROVAL: "bg-violet-400 shadow-[0_0_6px_rgba(167,139,250,0.7)]",
  DONE: "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]",
  REJECTED: "bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.7)]",
};

const EXECUTION_SESSION_STORAGE_KEY = (projectId: string, planId: string) =>
  `executionSession:${projectId}:${planId}`;
const EXECUTION_CONSOLE_STORAGE_KEY = (projectId: string) => `executionConsole:${projectId}`;

function getDisplayModel(aiProvider?: string | null, aiModel?: string | null): string {
  if (aiModel) return aiModel;
  const prov = (aiProvider ?? "").toLowerCase();
  if (prov === "zai" || prov === "z.ai" || prov === "glm") return "glm-4.7";
  if (prov === "anthropic") return "claude-3-5-sonnet-latest";
  return "gpt-4o-mini";
}

export default function PlanPageClient({
  projectId,
  planId,
  tasks: initialTasks,
  aiProvider,
  aiModel,
  onBackToPlans,
  embeddedInCanvas = false,
}: PlanPageClientProps) {
  console.log("PlanPageClient rendered with projectId:", projectId);
  const [planView, setPlanView] = useState<"board" | "graph">("board");
  const [leftTab, setLeftTab] = useState<"workspace" | "tasks" | "insights" | "tickets">("tasks");
  const [isNavCollapsed, setIsNavCollapsed] = useState(false);
  const [executionSessionId, setExecutionSessionId] = useState<string | null>(null);
  const [isExecutionStarted, setIsExecutionStarted] = useState(false);
  const [showStartModal, setShowStartModal] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [autoApprove, setAutoApprove] = useState(false);
  const [costLimit, setCostLimit] = useState<number>(5);
  const [executionMode, setExecutionMode] = useState<ExecutionMode | null>(null);
  const [executionEngine, setExecutionEngine] = useState<ExecutionEngine>("ahp");
  const [tasks, setTasks] = useState<TaskDetail[]>(initialTasks);
  const [syncEnsured, setSyncEnsured] = useState(false);
  const [executionConsoleMessages, setExecutionConsoleMessages] = useState<ConsoleMessage[]>([]);
  const [hasNewInsights, setHasNewInsights] = useState(false);
  const [showSessionSummary, setShowSessionSummary] = useState(false);
  const router = useRouter();

  // Restore console logs from localStorage so they persist across reloads
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(EXECUTION_CONSOLE_STORAGE_KEY(projectId));
      if (!raw) return;
      const parsed = JSON.parse(raw) as Array<Omit<ConsoleMessage, "timestamp"> & { timestamp: string }>;
      const restored: ConsoleMessage[] = parsed.map((m) => ({ ...m, timestamp: new Date(m.timestamp) }));
      setExecutionConsoleMessages(restored);
    } catch {
      // ignore
    }
  }, [projectId]);

  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  // Ensure sync client / workspace on mount
  useEffect(() => {
    const ensureSync = async () => {
      try {
        await fetch(`/api/projects/${encodeURIComponent(projectId)}/ensure-sync`, {
          method: "POST",
        });
      } catch (error) {
        console.error("[PlanPageClient] Failed to ensure sync client:", error);
      } finally {
        setSyncEnsured(true);
      }
    };

    if (!syncEnsured) {
      ensureSync();
    }
  }, [syncEnsured, projectId]);

  useEffect(() => {
    const key = EXECUTION_SESSION_STORAGE_KEY(projectId, planId);
    const saved = typeof window !== "undefined" ? localStorage.getItem(key) : null;
    if (saved) {
      setExecutionSessionId(saved);
      setIsExecutionStarted(true);
      setExecutionMode("cloud");
    }
  }, [projectId, planId]);

  const completedTasks = tasks.filter((t) => t.status === "DONE").length;
  const progress = tasks.length > 0 ? (completedTasks / tasks.length) * 100 : 0;
  const currentCost = 0.0025;

  const selectedTask = useMemo(
    () => tasks.find((t) => t.id === selectedTaskId) ?? null,
    [selectedTaskId, tasks]
  );

  const groupedTasks = useMemo(() => {
    const groups: Record<TaskStatus, TaskDetail[]> = {
      TODO: [],
      IN_PROGRESS: [],
      REVIEW: [],
      WAITING_APPROVAL: [],
      DONE: [],
      REJECTED: [],
    };
    for (const task of tasks) {
      groups[task.status].push(task);
    }
    return groups;
  }, [tasks]);

  const executionStateByTaskId = useMemo(
    () => deriveExecutionStateFromLogs(executionConsoleMessages, tasks.map((t) => t.id)),
    [executionConsoleMessages, tasks]
  );

  const handleSelectTask = useCallback((taskId: string) => {
    setSelectedTaskId(taskId);
  }, []);

  const handleStartExecution = useCallback(
    async (config: { autoApprove: boolean; costLimit?: number; engine: "legacy" | "ahp" }) => {
      try {
        const engine = config.engine === "ahp" ? "ahp" : "legacy";

        const response = await fetch("/api/execution-sessions/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            planId,
            autoApprove: config.autoApprove,
            costLimit: config.costLimit,
            executionMode: "cloud",
            engine,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to start execution session");
        }

        const data = await response.json();
        console.log(data);

        setExecutionSessionId(data.sessionId);
        setIsExecutionStarted(true);
        setExecutionMode("cloud");
        setShowStartModal(false);
        if (typeof window !== "undefined") {
          localStorage.setItem(EXECUTION_SESSION_STORAGE_KEY(projectId, planId), data.sessionId);
        }
      } catch (error) {
        console.error("Failed to start execution:", error);
        throw error;
      }
    },
    [projectId, planId]
  );

  const handleStopExecution = useCallback(async () => {
    if (!executionSessionId) return;
    const key = EXECUTION_SESSION_STORAGE_KEY(projectId, planId);

    try {
      await fetch(`/api/execution-sessions/${executionSessionId}/stop`, {
        method: "POST",
      });
    } catch (error) {
      console.error("Failed to stop execution session:", error);
    } finally {
      setIsExecutionStarted(false);
      setExecutionSessionId(null);
      if (typeof window !== "undefined") {
        localStorage.removeItem(key);
      }
    }
  }, [executionSessionId, projectId, planId]);

  const handleSessionStopped = useCallback(() => {
    setIsExecutionStarted(false);
    // Не сбрасываем executionSessionId сразу — используем его для выборки инсайтов в модалке
    setShowSessionSummary(true);
    if (typeof window !== "undefined") {
      localStorage.removeItem(EXECUTION_SESSION_STORAGE_KEY(projectId, planId));
    }
  }, [projectId, planId]);

  const handleTaskUpdate = useCallback(async (update: { taskId: string; status: string }) => {
    // Update status immediately for responsive UI
    setTasks((prev) =>
      prev.map((t) => (t.id === update.taskId ? { ...t, status: update.status as TaskDetail["status"] } : t))
    );

    // Refresh server components to update progress bars
    router.refresh();

    // If task is DONE, refetch full data including generatedPrompt and comments
    if (update.status === "DONE") {
      console.log(`[PlanPageClient] Task ${update.taskId} completed, refetching full data...`);
      try {
        const res = await fetch(`/api/tasks/${update.taskId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.task) {
            console.log(`[PlanPageClient] Refetched task ${update.taskId} with generatedPrompt:`, 
              data.task.generatedPrompt ? "present" : "missing");
            setTasks((prev) =>
              prev.map((t) => (t.id === update.taskId ? { ...t, ...data.task } : t))
            );
          }
        } else {
          console.error(`[PlanPageClient] Failed to refetch task ${update.taskId}:`, res.status);
        }
      } catch (error) {
        console.error(`[PlanPageClient] Error refetching task ${update.taskId}:`, error);
      }
    }
  }, [router]);

  const TaskItem = ({ task, index }: { task: TaskDetail; index: number }) => (
    <div
      onClick={() => {
        handleSelectTask(task.id);
      }}
      className={cn(
        "cursor-pointer rounded border bg-white px-3 py-2 text-xs transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800",
        selectedTaskId === task.id && "border-blue-300 bg-blue-50 dark:border-blue-600 dark:bg-blue-950/40",
        task.status === "DONE" && "opacity-80"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-slate-100 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-200">
            {index + 1}
          </span>
          <span className="truncate text-[11px] font-medium text-slate-600 dark:text-slate-200">
            {task.executorAgent ? getExecutorDisplayLabel(task.executorAgent) : "UNASSIGNED"}
          </span>
        </div>
        <Badge
          variant="outline"
          className={cn("flex-shrink-0 border text-[10px]", statusColors[task.status])}
        >
          {task.status.replace("_", " ")}
        </Badge>
      </div>
      <p className="mt-1 line-clamp-2 text-xs font-medium text-slate-900 dark:text-slate-50">{task.title}</p>
      {task.dependencies && task.dependencies.length > 0 && (
        <div className="mt-1 flex items-center gap-1">
          <span className="text-[10px] text-slate-500 dark:text-slate-400">Depends on:</span>
          {task.dependencies.slice(0, 2).map((dep) => (
            <Badge
              key={dep.id}
              variant="outline"
              className="h-4 px-1 text-[9px] border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-100"
            >
              {dep.status === "DONE" ? <Check className="mr-0.5 inline h-2.5 w-2.5" /> : <Circle className="mr-0.5 inline h-2.5 w-2.5" />}
              {dep.title.slice(0, 15)}...
            </Badge>
          ))}
          {task.dependencies.length > 2 && (
            <span className="text-[10px] text-slate-500 dark:text-slate-400">
              +{task.dependencies.length - 2}
            </span>
          )}
        </div>
      )}
    </div>
  );

  type FileNode = {
    name: string;
    path: string;
    type: "file" | "directory";
    children?: FileNode[];
  };

  const [fileViewerPath, setFileViewerPath] = useState("");
  const [fileViewerContent, setFileViewerContent] = useState<string | null>(null);
  const [fileViewerLoading, setFileViewerLoading] = useState(false);
  const [fileViewerError, setFileViewerError] = useState<string | null>(null);
  const [ticketModalTask, setTicketModalTask] = useState<TaskDetail | null>(null);
  const [ticketTitle, setTicketTitle] = useState("");
  const [ticketDescription, setTicketDescription] = useState("");
  const [ticketSubmitting, setTicketSubmitting] = useState(false);

  const getLanguageFromPath = (path: string): string => {
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    const map: Record<string, string> = {
      html: "html",
      htm: "html",
      css: "css",
      js: "javascript",
      jsx: "jsx",
      ts: "typescript",
      tsx: "tsx",
      json: "json",
      md: "markdown",
      py: "python",
      rb: "ruby",
      yaml: "yaml",
      yml: "yaml",
      sh: "bash",
    };
    return map[ext] ?? "plaintext";
  };

  const handleFileClick = useCallback(
    async (path: string) => {
      setFileViewerPath(path);
      setFileViewerContent(null);
      setFileViewerError(null);
      setFileViewerLoading(true);
      try {
        const res = await fetch(
          `/api/files/content?projectId=${encodeURIComponent(projectId)}&path=${encodeURIComponent(path)}`
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `Failed to load file (${res.status})`);
        }
        const data = await res.json();
        setFileViewerContent(data.content ?? "");
      } catch (e) {
        setFileViewerError(e instanceof Error ? e.message : "Failed to load file");
      } finally {
        setFileViewerLoading(false);
      }
    },
    [projectId]
  );

  const FileTree = ({ projectId }: { projectId: string }) => {
    const [root, setRoot] = useState<FileNode | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

    useEffect(() => {
      let cancelled = false;
      const FILE_TREE_TIMEOUT_MS = 30000;
      const MAX_RETRIES = 2;

      const load = async (retryCount = 0) => {
        setIsLoading(true);
        setError(null);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), FILE_TREE_TIMEOUT_MS);
        try {
          const res = await fetch(
            `/api/files?projectId=${encodeURIComponent(projectId)}&maxDepth=2`,
            { signal: controller.signal }
          );
          clearTimeout(timeoutId);
          if (!res.ok) {
            const errText = await res.text();
            if (!cancelled) {
              setError(`Failed to load files (${res.status}): ${errText}`);
            }
            return;
          }
          const data = await res.json();
          if (!cancelled) {
            const rootNode = data.root as FileNode | null | undefined;
            setRoot(rootNode ?? null);
            setExpandedPaths(new Set([""]));
          }
        } catch (e) {
          clearTimeout(timeoutId);
          if (!cancelled) {
            const isTimeout = e instanceof Error && e.name === "AbortError";
            const msg = isTimeout
              ? "Request timed out. Could not load file tree."
              : e instanceof Error
                ? e.message
                : String(e);
            if (retryCount < MAX_RETRIES && isTimeout) {
              setTimeout(() => load(retryCount + 1), 1000 * (retryCount + 1));
            } else {
              setError(msg);
            }
          }
        } finally {
          if (!cancelled) {
            setIsLoading(false);
          }
        }
      };

      load();

      return () => {
        cancelled = true;
      };
    }, [projectId]);

    const togglePath = (path: string) => {
      setExpandedPaths((prev) => {
        const next = new Set(prev);
        if (next.has(path)) {
          next.delete(path);
        } else {
          next.add(path);
        }
        return next;
      });
    };

    const renderNode = (node: FileNode, depth: number = 0) => {
      const isDir = node.type === "directory";
      const isExpanded = expandedPaths.has(node.path);
      const hasChildren = !!(node.children && node.children.length > 0);

      return (
        <div key={node.path || "__root"} className="text-[11px] text-slate-700 dark:text-slate-200">
          <button
            type="button"
            onClick={() =>
              isDir ? togglePath(node.path) : handleFileClick(node.path)
            }
            className="flex w-full cursor-pointer items-center gap-1 rounded px-2 py-0.5 text-left hover:bg-zinc-900"
            style={{ paddingLeft: 8 + depth * 12 }}
          >
            {isDir ? (
              <Folder className="h-3 w-3 text-amber-500 flex-shrink-0" />
            ) : (
              <FileText className="h-3 w-3 flex-shrink-0 text-zinc-500" />
            )}
            <span className="truncate">{node.name || projectId}</span>
          </button>
          {isDir && isExpanded && hasChildren && (
            <div className="mt-0.5">
              {node.children!.map((child) => renderNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    };

    return (
      <div className="flex h-full flex-col overflow-hidden">
        <div className="flex items-center gap-1 border-b border-slate-200 bg-slate-100 px-3 py-2 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
          <Folder className="h-3 w-3 flex-shrink-0 text-amber-500" />
          <span className="text-[11px] font-medium">Workspace</span>
        </div>
        <ScrollArea className="flex-1">
          <div className="space-y-1 p-2">
            {isLoading && (
              <p className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Loading file tree...
              </p>
            )}
            {error && !isLoading && (
              <p className="text-[11px] text-red-500 dark:text-red-400">{error}</p>
            )}
            {!isLoading && !error && root && renderNode(root)}
            {!isLoading && !error && !root && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">No files found.</p>
            )}
          </div>
        </ScrollArea>
      </div>
    );
  };

  return (
    <>
      <div className="flex h-full w-full flex-col overflow-hidden bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-50">
        <header className="flex h-12 flex-shrink-0 items-center justify-between border-b border-slate-200 px-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            {onBackToPlans && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-xs border-slate-200 dark:border-slate-700"
                onClick={onBackToPlans}
              >
                <ArrowUp className="h-4 w-4" />
                К планам
              </Button>
            )}
            <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">
              План разработки
            </p>
            <div className="h-4 w-px bg-slate-200 dark:bg-slate-800" />
            <h1 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
              Task Execution
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Button size="sm" className="h-8 gap-2 text-xs" onClick={() => setShowStartModal(true)}>
              <PlayCircle className="h-4 w-4" />
              Start Auto Execution
            </Button>
            <Button size="sm" variant="outline" className="h-8 gap-2 text-xs" asChild>
              <a href={`/api/download-kit?projectId=${encodeURIComponent(projectId)}`}>
                Download Kit
              </a>
            </Button>
          </div>
        </header>

        {/* Status bar: sync, model, Auto-Approve, cost — always visible */}
        <div className="flex h-10 flex-shrink-0 items-center justify-between border-b border-slate-200 px-4 text-xs dark:border-slate-800">
          <div className="flex items-center gap-4">
            {!(executionMode === "cloud" && isExecutionStarted) && (
              <SyncStatusIndicator projectId={projectId} />
            )}
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
              <span className="font-medium">Текущая модель:</span>
              <span className="font-mono text-slate-800 dark:text-slate-100">
                {getDisplayModel(aiProvider, aiModel)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="auto-approve" checked={autoApprove} onCheckedChange={setAutoApprove} />
              <label htmlFor="auto-approve" className="flex cursor-pointer items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
                <Shield className="h-4 w-4" />
                Auto-Approve
              </label>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm">
              <DollarSign className="h-3 w-3 text-slate-500 dark:text-slate-400" />
              <span className="text-xs text-slate-700 dark:text-slate-200">
                ${currentCost.toFixed(4)}
              </span>
              <span className="text-slate-400 dark:text-slate-500">/</span>
              <span className="text-xs font-medium text-slate-900 dark:text-slate-100">
                ${costLimit.toFixed(2)}
              </span>
            </div>
            <Progress value={(currentCost / costLimit) * 100} className="h-1.5 w-24" />
            {!isExecutionStarted ? null : (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={handleStopExecution}
                >
                  <Square className="h-4 w-4" />
                  Stop
                </Button>
                <Badge variant="outline" className="gap-1">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  Running
                </Badge>
              </div>
            )}
          </div>
        </div>

        <div className={cn("flex flex-1 min-h-0 flex-col overflow-hidden", embeddedInCanvas && "relative")}>
          <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left navigator panel with collapse */}
          <aside
            className={cn(
              "relative flex h-full flex-shrink-0 flex-col border-r border-slate-200 bg-white py-2 transition-all duration-300 ease-in-out dark:border-slate-800 dark:bg-slate-900",
              isNavCollapsed ? "w-10 px-1" : "w-64 px-2"
            )}
          >
            <button
              type="button"
              aria-label={isNavCollapsed ? "Развернуть навигатор" : "Свернуть навигатор"}
              onClick={() => setIsNavCollapsed((prev) => !prev)}
              className="absolute -right-3 top-4 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {isNavCollapsed ? (
                <ChevronRight className="h-3 w-3" />
              ) : (
                <ChevronLeft className="h-3 w-3" />
              )}
            </button>

            {!isNavCollapsed && (
              <>
                <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 text-[11px] dark:border-slate-800">
                  <span className="uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                    NAV
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1 border-b border-slate-200 px-2 py-1 text-[11px] dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setLeftTab("tasks")}
                    className={cn(
                      "min-w-0 rounded-md px-2 py-1 flex items-center justify-center gap-1 truncate",
                      "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
                      leftTab === "tasks" &&
                        "bg-slate-900 text-slate-50 dark:bg-slate-100 dark:text-slate-900"
                    )}
                  >
                    <CheckSquare className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="truncate">Tasks</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLeftTab("workspace")}
                    className={cn(
                      "min-w-0 rounded-md px-2 py-1 flex items-center justify-center gap-1 truncate",
                      "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
                      leftTab === "workspace" &&
                        "bg-slate-900 text-slate-50 dark:bg-slate-100 dark:text-slate-900"
                    )}
                  >
                    <FolderOpen className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="truncate">Workspace</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLeftTab("insights");
                      setHasNewInsights(false);
                    }}
                    className={cn(
                      "min-w-0 rounded-md px-2 py-1 flex items-center justify-center gap-1 truncate",
                      "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
                      leftTab === "insights" &&
                        "bg-slate-900 text-slate-50 dark:bg-slate-100 dark:text-slate-900"
                    )}
                  >
                    <Brain className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="truncate">Insights</span>
                    {hasNewInsights && (
                      <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)]" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setLeftTab("tickets")}
                    className={cn(
                      "min-w-0 rounded-md px-2 py-1 flex items-center justify-center gap-1 truncate",
                      "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
                      leftTab === "tickets" &&
                        "bg-slate-900 text-slate-50 dark:bg-slate-100 dark:text-slate-900"
                    )}
                  >
                    <FileText className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="truncate">Tickets</span>
                  </button>
                </div>
                <ScrollArea className="flex-1">
                  <div className="p-2">
                    {leftTab === "workspace" ? (
                      <FileTree projectId={projectId} />
                    ) : leftTab === "tickets" ? (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 px-2 py-4">
                        Тикеты отображаются в центральной панели.
                      </p>
                    ) : leftTab === "tasks" ? (
                      <div className="space-y-3">
                        {(["IN_PROGRESS", "TODO", "REVIEW", "WAITING_APPROVAL", "DONE", "REJECTED"] as TaskStatus[]).map(
                          (status) => {
                            const items = groupedTasks[status];
                            if (!items || items.length === 0) return null;
                            const statusLabel =
                              status === "IN_PROGRESS"
                                ? "IN PROGRESS"
                                : status === "WAITING_APPROVAL"
                                  ? "WAITING APPROVAL"
                                  : status;
                            return (
                              <div key={status} className="space-y-1">
                                <div className="flex items-center justify-between px-1">
                                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                    {statusLabel}
                                  </span>
                                  <span className="text-[10px] text-slate-500 dark:text-slate-400">
                                    {items.length}
                                  </span>
                                </div>
                                <div className="space-y-1">
                                  {items.map((task) => (
                                    <button
                                      key={task.id}
                                      type="button"
                                      onClick={() => handleSelectTask(task.id)}
                                      className={cn(
                                        "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[11px] transition hover:bg-slate-100 dark:hover:bg-slate-800/70",
                                        selectedTaskId === task.id &&
                                          "bg-slate-100 font-medium dark:bg-slate-800/80"
                                      )}
                                    >
                                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-200">
                                        <span
                                          className={cn(
                                            "inline-flex h-2 w-2 rounded-full",
                                            statusDotClasses[task.status]
                                          )}
                                        />
                                      </span>
                                      <div className="flex min-w-0 flex-col">
                                        <span className="line-clamp-2 text-[11px] text-slate-700 dark:text-slate-100">
                                          {task.title}
                                        </span>
                                        <span className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                                          {task.executorAgent ? getExecutorDisplayLabel(task.executorAgent) : "UNASSIGNED"}
                                        </span>
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            );
                          }
                        )}
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 px-2 py-4">
                        Инсайты отображаются в центральной панели.
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </>
            )}
          </aside>

          {/* Center panel */}
          <div className="flex min-w-0 flex-1 flex-col border-r border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950">
            {leftTab === "tasks" && (
              <div className="flex h-10 flex-shrink-0 items-center justify-between border-b border-slate-200 px-3 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                    VIEW
                  </span>
                  <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-1 py-0.5 dark:border-slate-700 dark:bg-slate-900">
                    <button
                      type="button"
                      onClick={() => setPlanView("board")}
                      className={cn(
                        "flex items-center gap-1 rounded-full px-3 py-0.5 text-[11px] font-medium",
                        planView === "board"
                          ? "bg-slate-900 text-slate-50 shadow-sm dark:bg-slate-100 dark:text-slate-900"
                          : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                      )}
                    >
                      <ListChecks className="h-3 w-3" />
                      List
                    </button>
                    <button
                      type="button"
                      onClick={() => setPlanView("graph")}
                      className={cn(
                        "flex items-center gap-1 rounded-full px-3 py-0.5 text-[11px] font-medium",
                        planView === "graph"
                          ? "bg-slate-900 text-slate-50 shadow-sm dark:bg-slate-100 dark:text-slate-900"
                          : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                      )}
                    >
                      <GitGraph className="h-3 w-3" />
                      Graph
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-50 dark:bg-slate-950">
              {leftTab === "insights" && (
                <ScrollArea className="h-full">
                  <InsightsPanel projectId={projectId} planId={planId} />
                </ScrollArea>
              )}
              {leftTab === "tickets" && (
                <ScrollArea className="h-full">
                  <div className="p-4">
                    <ProjectTicketsTab projectId={projectId} />
                  </div>
                </ScrollArea>
              )}
              {leftTab === "workspace" && fileViewerPath && (
                <div className="flex h-full flex-col overflow-hidden">
                  <div className="flex-shrink-0 border-b border-slate-200 px-4 py-2 dark:border-slate-800">
                    <p className="font-mono text-sm truncate text-slate-700 dark:text-slate-200">
                      {fileViewerPath}
                    </p>
                  </div>
                  <div className="min-h-0 flex-1 overflow-auto p-4">
                    {fileViewerLoading && (
                      <p className="text-sm text-slate-500 dark:text-slate-400 py-4">Loading...</p>
                    )}
                    {fileViewerError && (
                      <p className="text-sm text-red-500 dark:text-red-400 py-4">{fileViewerError}</p>
                    )}
                    {!fileViewerLoading && !fileViewerError && fileViewerContent !== null && (
                      <div className="min-w-0 overflow-auto rounded-md">
                        <SyntaxHighlighter
                          language={getLanguageFromPath(fileViewerPath)}
                          style={oneDark}
                          customStyle={{
                            margin: 0,
                            padding: "1rem",
                            fontSize: "13px",
                            borderRadius: "0.5rem",
                            background: "#1e1e1e",
                          }}
                          showLineNumbers
                          lineNumberStyle={{ minWidth: "2.5em", opacity: 0.5 }}
                          PreTag="div"
                        >
                          {fileViewerContent}
                        </SyntaxHighlighter>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {leftTab === "workspace" && !fileViewerPath && (
                <div className="flex h-full items-center justify-center p-6 text-center">
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Выберите файл в панели слева, чтобы просмотреть содержимое.
                  </p>
                </div>
              )}
              {leftTab === "tasks" && (
                <div className="h-full w-full">
                  <TaskListClient
                    tasks={tasks}
                    viewMode={planView === "board" ? "kanban" : "graph"}
                    onTaskClick={handleSelectTask}
                    executionStateByTaskId={executionStateByTaskId}
                    onCreateTicket={(task) => {
                      setTicketModalTask(task);
                      setTicketTitle(task.title);
                      setTicketDescription("");
                    }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Right inspector panel – always visible */}
          <div className="flex h-full w-[320px] flex-shrink-0 flex-col border-l border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
            <TaskInspectorPanel
              task={selectedTask}
              tasks={tasks}
              onTaskUpdate={(next) => {
                setTasks((prev) =>
                  prev.map((t) => (t.id === next.id ? { ...t, ...next } : t))
                );
              }}
            />
          </div>
          </div>

          {/* Collapsible Agent Stream panel: fixed to viewport bottom when embedded (no page scroll), else in flow */}
          <div className={cn(embeddedInCanvas && "fixed bottom-0 left-0 right-0 z-50")}>
            <AgentStreamPanel
              projectId={projectId}
              sessionId={executionSessionId || undefined}
              autoApprove={autoApprove}
              onTaskUpdate={handleTaskUpdate}
              onSessionStopped={handleSessionStopped}
              onReflexologistRun={() => setHasNewInsights(true)}
              messages={executionConsoleMessages}
              onMessagesChange={setExecutionConsoleMessages}
              embeddedCompact={embeddedInCanvas}
            />
          </div>
        </div>
      </div>

      <StartExecutionModal open={showStartModal} onOpenChange={setShowStartModal} onStart={handleStartExecution} />

      {executionSessionId && (
        <SessionSummaryModal
          projectId={projectId}
          sessionId={executionSessionId}
          open={showSessionSummary}
          onOpenChange={(open) => {
            setShowSessionSummary(open);
            if (!open) {
              setExecutionSessionId(null);
            }
          }}
        />
      )}

      <Dialog
        open={!!ticketModalTask}
        onOpenChange={(open) => {
          if (!open) {
            setTicketModalTask(null);
            setTicketTitle("");
            setTicketDescription("");
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">
              {ticketModalTask
                ? `Create Ticket for: “${ticketModalTask.title}”`
                : "Create a Ticket"}
            </DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!ticketModalTask) return;
              if (!ticketTitle.trim() || !ticketDescription.trim()) return;
              try {
                setTicketSubmitting(true);
                const res = await fetch("/api/tickets", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    projectId,
                    title: ticketTitle.trim(),
                    description: ticketDescription.trim(),
                    relatedTaskId: ticketModalTask.id,
                  }),
                });
                if (!res.ok) {
                  console.error("[PlanPageClient] Failed to create ticket", res.status);
                  return;
                }
                setTicketModalTask(null);
                setTicketTitle("");
                setTicketDescription("");
              } catch (error) {
                console.error("[PlanPageClient] Error creating ticket", error);
              } finally {
                setTicketSubmitting(false);
              }
            }}
          >
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-200">
                Title
              </label>
              <Input
                value={ticketTitle}
                onChange={(e) => setTicketTitle(e.target.value)}
                placeholder="Short summary of the issue"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-200">
                Description
              </label>
              <textarea
                className="min-h-[120px] w-full rounded-md border border-slate-200 bg-background px-3 py-2 text-sm text-slate-900 shadow-sm ring-offset-background placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus-visible:ring-slate-500"
                value={ticketDescription}
                onChange={(e) => setTicketDescription(e.target.value)}
                placeholder="Describe the bug or small improvement you need..."
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setTicketModalTask(null);
                  setTicketTitle("");
                  setTicketDescription("");
                }}
                disabled={ticketSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={
                  ticketSubmitting ||
                  !ticketTitle.trim() ||
                  !ticketDescription.trim()
                }
              >
                {ticketSubmitting ? "Creating..." : "Create Ticket"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

type InspectorTaskUpdate = Partial<TaskDetail> & { id: string };

type TaskInspectorPanelProps = {
  task: TaskDetail | null;
  tasks: TaskDetail[];
  onTaskUpdate: (next: InspectorTaskUpdate) => void;
};

type SimpleComment = {
  id: string;
  content: string;
  authorRole: string;
  createdAt: string;
};

function TaskInspectorPanel({ task, tasks, onTaskUpdate }: TaskInspectorPanelProps) {
  const [comments, setComments] = useState<SimpleComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentInput, setCommentInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState<TaskStatus | null>(null);

  useEffect(() => {
    if (!task?.id) {
      setComments([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        setCommentsLoading(true);
        const res = await fetch(`/api/comments?taskId=${task.id}`);
        if (!res.ok || cancelled) return;
        const payload = await res.json();
        const serverComments = Array.isArray(payload?.comments) ? payload.comments : [];
        if (!cancelled) setComments(serverComments);
      } finally {
        if (!cancelled) setCommentsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [task?.id]);

  const handleSendComment = useCallback(async () => {
    if (!task?.id || !commentInput.trim() || isSending) return;
    const content = commentInput.trim();
    setCommentInput("");
    setIsSending(true);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.id, content, authorRole: "TEAMLEAD" }),
      });
      if (!res.ok) throw new Error("Failed to send comment");
      const payload = await res.json().catch(() => ({}));
      if (payload?.comment) {
        setComments((prev) => [...prev, payload.comment]);
      }
    } catch {
      setCommentInput(content);
    } finally {
      setIsSending(false);
    }
  }, [task?.id, commentInput, isSending]);

  if (!task) {
    const total = tasks.length;
    const done = tasks.filter((t) => t.status === "DONE").length;
    const inProgress = tasks.filter((t) => t.status === "IN_PROGRESS").length;
    const todo = tasks.filter((t) => t.status === "TODO").length;

    return (
      <div className="flex h-full flex-col justify-between bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-50">
        <div className="space-y-2 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
            Project Overview
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Select a task from the workspace or graph to see its details.
          </p>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                Общий прогресс
              </p>
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                {total > 0 ? Math.round((done / total) * 100) : 0}%
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-300 ease-out dark:bg-blue-400"
                style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }}
              />
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {done}/{total} задач
            </p>
          </div>
        </div>
        <div className="space-y-2 border-t border-slate-200 bg-slate-50 p-4 text-[11px] text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
          <p className="font-semibold uppercase tracking-[0.2em]">
            Hint
          </p>
          <p>
            Click on a task in the left sidebar, list, or graph to open it in this inspector.
          </p>
        </div>
      </div>
    );
  }

  const handleMarkDone = async () => {
    if (!task) return;
    const previous = task.status;
    const nextStatus: TaskStatus = "DONE";
    setUpdatingStatus(nextStatus);
    onTaskUpdate({ id: task.id, status: nextStatus });

    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        throw new Error("Failed to update task");
      }
      const payload = await res.json().catch(() => null);
      if (payload?.task) {
        onTaskUpdate({ id: task.id, ...payload.task });
      }
    } catch {
      onTaskUpdate({ id: task.id, status: previous });
    } finally {
      setUpdatingStatus(null);
    }
  };

  const handlePause = async () => {
    if (!task) return;
    const previous = task.status;
    const nextStatus: TaskStatus = "IN_PROGRESS";
    setUpdatingStatus(nextStatus);
    onTaskUpdate({ id: task.id, status: nextStatus });

    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        throw new Error("Failed to update task");
      }
      const payload = await res.json().catch(() => null);
      if (payload?.task) {
        onTaskUpdate({ id: task.id, ...payload.task });
      }
    } catch {
      onTaskUpdate({ id: task.id, status: previous });
    } finally {
      setUpdatingStatus(null);
    }
  };

  return (
    <>
      <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
          Task
        </p>
        <p className="mt-1 line-clamp-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
          {task.title}
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <ScrollArea className="flex-1 px-4 py-3">
          {commentsLoading ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">Loading conversation...</p>
          ) : comments.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Пока нет сообщений. Напишите ниже, чтобы начать диалог с агентом.
            </p>
          ) : (
            <div className="space-y-2 text-xs">
              {comments.map((c) => (
                <div key={c.id} className="rounded-md bg-slate-100 p-2 dark:bg-slate-800">
                  <div className="mb-1 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                    <span>{c.authorRole}</span>
                    <span>{new Date(c.createdAt).toLocaleTimeString()}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-slate-800 dark:text-slate-100">
                    {c.content}
                  </p>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="flex-shrink-0 border-t border-slate-200 px-3 py-2 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Input
              type="text"
              value={commentInput}
              onChange={(e) => setCommentInput(e.target.value)}
              placeholder="Сообщение..."
              className="min-w-0 text-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendComment();
                }
              }}
            />
            <Button
              size="sm"
              className="h-8 shrink-0 px-2"
              onClick={handleSendComment}
              disabled={isSending || !commentInput.trim()}
            >
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-800">
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1 text-xs"
            onClick={handlePause}
            disabled={!!updatingStatus}
          >
            <Pause className="h-3.5 w-3.5" />
            Pause
          </Button>
          <Button
            size="sm"
            className="gap-1 text-xs"
            onClick={handleMarkDone}
            disabled={!!updatingStatus}
          >
            <Check className="h-3.5 w-3.5" />
            Mark as Done
          </Button>
        </div>
      </div>
    </>
  );
}
