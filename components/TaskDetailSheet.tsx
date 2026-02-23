"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronDown, Copy, DollarSign, Loader2, Send, FileText, X, Upload, Image as ImageIcon, Trash2, Edit2, Check, X as XIcon } from "lucide-react";
import Image from "next/image";
import { CopyIdButton } from "@/components/CopyIdButton";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { getExecutorDisplayLabel } from "@/lib/agent-display";

export type TaskDetail = {
  id: string;
  title: string;
  description: string;
  status: "TODO" | "IN_PROGRESS" | "REVIEW" | "DONE" | "WAITING_APPROVAL" | "REJECTED";
  executorAgent: "TASK_EXECUTOR" | "BACKEND" | "DEVOPS" | "TEAMLEAD" | "CURSOR" | "QA" | "CSS" | null;
  observerAgent: "TASK_EXECUTOR" | "BACKEND" | "DEVOPS" | "TEAMLEAD" | "CURSOR" | "QA" | "CSS";
  generatedPrompt: string | null;
  branchName?: string | null;
  dependencies?: { id: string; title: string; status: string }[];
  verificationCriteria?: { complexity?: string };
};

type TaskComment = {
  id: string;
  content: string;
  authorRole: "TASK_EXECUTOR" | "BACKEND" | "DEVOPS" | "TEAMLEAD" | "CURSOR" | "QA" | "CSS";
  createdAt: string;
};

type TaskAttachment = {
  id: string;
  taskId: string;
  filePath: string;
  fileName: string;
  mimeType: string;
  visionAnalysis: string | null;
  createdAt: string;
};

const agentBadgeStyles: Record<string, string> = {
  TASK_EXECUTOR: "bg-blue-100 text-blue-700",
  BACKEND: "bg-emerald-100 text-emerald-700",
  DEVOPS: "bg-orange-100 text-orange-700",
  TEAMLEAD: "bg-purple-100 text-purple-700",
  CURSOR: "bg-pink-100 text-pink-700",
  QA: "bg-yellow-100 text-yellow-700",
};

const statusBadgeStyles: Record<string, string> = {
  TODO: "bg-slate-100 text-slate-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  REVIEW: "bg-amber-100 text-amber-700",
  WAITING_APPROVAL: "bg-violet-100 text-violet-700",
  DONE: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-red-100 text-red-700",
};
const agentLabels: Record<TaskComment["authorRole"], string> = {
  TASK_EXECUTOR: "Frontend",
  BACKEND: "Backend",
  DEVOPS: "DevOps",
  CSS: "CSS",
  TEAMLEAD: "Teamlead",
  CURSOR: "Cursor",
  QA: "QA",
};

const mentionPattern = /@(taskexecutor|frontend|backend|devops|teamlead|cursor|qa|css)/i;
const mentionRoleMap: Record<string, TaskComment["authorRole"]> = {
  taskexecutor: "TASK_EXECUTOR",
  frontend: "TASK_EXECUTOR", // legacy alias
  backend: "BACKEND",
  devops: "DEVOPS",
  teamlead: "TEAMLEAD",
  cursor: "CURSOR",
  qa: "QA",
  css: "CSS",
};

function commentMarkdownComponents(isUser: boolean) {
  const codeBg = isUser ? "bg-white/20" : "bg-slate-200 text-slate-800";
  const linkClass = isUser ? "text-slate-200 underline" : "text-blue-600 underline";
  return {
    p: ({ children }: { children?: React.ReactNode }) => (
      <p className="whitespace-pre-wrap mb-2 last:mb-0">{children}</p>
    ),
    strong: ({ children }: { children?: React.ReactNode }) => (
      <strong className="font-semibold">{children}</strong>
    ),
    em: ({ children }: { children?: React.ReactNode }) => (
      <em className="italic">{children}</em>
    ),
    code: ({ children }: { children?: React.ReactNode }) => (
      <code className={cn("rounded px-1 py-0.5 text-xs font-mono", codeBg)}>
        {children}
      </code>
    ),
    pre: ({ children }: { children?: React.ReactNode }) => (
      <pre className={cn("overflow-x-auto rounded p-2 text-xs my-2 font-mono", codeBg)}>
        {children}
      </pre>
    ),
    ul: ({ children }: { children?: React.ReactNode }) => (
      <ul className="list-disc list-inside my-2 space-y-0.5">{children}</ul>
    ),
    ol: ({ children }: { children?: React.ReactNode }) => (
      <ol className="list-decimal list-inside my-2 space-y-0.5">{children}</ol>
    ),
    a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
      <a href={href} target="_blank" rel="noopener noreferrer" className={linkClass}>
        {children}
      </a>
    ),
  };
}

function extractMention(content: string) {
  const match = content.match(mentionPattern);
  const role = match?.[1]?.toLowerCase();
  if (!role) {
    return null;
  }
  return mentionRoleMap[role] ?? null;
}

/** Вопрос к агенту: "?" или /ask или /вопрос — показываем "is typing" для исполнителя */
function isQuestionToExecutor(content: string): boolean {
  const t = content.trim();
  if (t.includes("?")) return true;
  const lower = t.toLowerCase();
  if (lower.startsWith("/ask") || lower.startsWith("/вопрос")) return true;
  return false;
}

export function TaskDetailSheet({
  task,
  planTasks,
  isOpen,
  onClose,
  onTaskUpdate,
}: {
  task: TaskDetail | null;
  planTasks: TaskDetail[];
  isOpen: boolean;
  onClose: () => void;
  onTaskUpdate: (task: Partial<TaskDetail> & { id: string }) => void;
}) {
  const [prompt, setPrompt] = useState<string | null>(task?.generatedPrompt ?? null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [commentInput, setCommentInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [status, setStatus] = useState<TaskDetail["status"]>(task?.status ?? "TODO");
  const [executorAgent, setExecutorAgent] = useState<
    TaskDetail["executorAgent"]
  >(task?.executorAgent ?? null);
  const [pendingAgentRole, setPendingAgentRole] = useState<TaskComment["authorRole"] | null>(
    null
  );
  const [branchCopied, setBranchCopied] = useState(false);
  const [taskCost, setTaskCost] = useState<number>(0);
  const [taskCostLoading, setTaskCostLoading] = useState(false);
  const [qaLogsVisible, setQaLogsVisible] = useState(false);
  const [qaLogs, setQaLogs] = useState<string[]>([]);
  const [qaLogsLoading, setQaLogsLoading] = useState(false);
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [editingAttachmentId, setEditingAttachmentId] = useState<string | null>(null);
  const [editingVisionAnalysis, setEditingVisionAnalysis] = useState("");
  const listEndRef = useRef<HTMLDivElement | null>(null);
  const { toast } = useToast();

  const dependencyIds = useMemo(
    () => (task?.dependencies ?? []).map((d) => d.id),
    [task?.dependencies]
  );
  const otherPlanTasks = useMemo(
    () => (planTasks ?? []).filter((t) => t.id !== task?.id),
    [planTasks, task?.id]
  );
  const incompleteDependencies = useMemo(
    () => (task?.dependencies ?? []).filter((d) => d.status !== "DONE"),
    [task?.dependencies]
  );

  useEffect(() => {
    setPrompt(task?.generatedPrompt ?? null);
    setIsGenerating(false);
    setCopied(false);
    setStatus(task?.status ?? "TODO");
    setExecutorAgent(task?.executorAgent ?? null);
    setCommentInput("");
    setComments([]);
    setPendingAgentRole(null);
    setAttachments([]);
  }, [task?.id, task?.generatedPrompt, task?.status, task?.executorAgent]);

  // Refetch task data when sheet opens to get latest generatedPrompt
  useEffect(() => {
    if (!task?.id || !isOpen) {
      return;
    }

    const taskId = task.id;
    const currentPrompt = task.generatedPrompt;

    async function refetchTask() {
      try {
        console.log(`[TaskDetailSheet] Refetching task ${taskId}...`);
        const response = await fetch(`/api/tasks/${taskId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.task?.generatedPrompt && data.task.generatedPrompt !== currentPrompt) {
            console.log(`[TaskDetailSheet] Found updated generatedPrompt for task ${taskId}`);
            setPrompt(data.task.generatedPrompt);
            // Update parent component
            onTaskUpdate({ id: taskId, generatedPrompt: data.task.generatedPrompt });
          }
        }
      } catch (error) {
        console.error("[TaskDetailSheet] Failed to refetch task:", error);
      }
    }

    refetchTask();
  }, [task?.id, task?.generatedPrompt, isOpen, onTaskUpdate]);

  useEffect(() => {
    if (!task?.id || !isOpen) {
      return;
    }

    const taskId = task.id;
    let isMounted = true;

    async function loadComments() {
      try {
        const response = await fetch(`/api/comments?taskId=${taskId}`);
        if (!response.ok) {
          return;
        }
        const payload = await response.json();
        if (!isMounted) {
          return;
        }
        const serverComments = Array.isArray(payload?.comments) ? payload.comments : [];

        setComments((current) => {
          const optimisticComments = current.filter((c: TaskComment) => c.id.startsWith("tmp-"));
          const serverIds = new Set(serverComments.map((c: TaskComment) => c.id));
          const validOptimistic = optimisticComments.filter((c: TaskComment) => !serverIds.has(c.id.substring(4)));
          return [...serverComments, ...validOptimistic];
        });

        const reversed = [...serverComments].reverse();
        const lastMention = reversed.find(
          (comment) =>
            comment.authorRole === "TEAMLEAD" && extractMention(comment.content)
        );
        const lastUserComment = reversed.find(
          (c: TaskComment) => c.authorRole === "TEAMLEAD"
        );
        const isQuestion = lastUserComment && isQuestionToExecutor(lastUserComment.content);
        const executorRole = task?.executorAgent ?? null;
        const hasExecutorReplyAfterLastUser =
          lastUserComment &&
          executorRole &&
          serverComments.some(
            (comment: TaskComment) =>
              comment.authorRole === executorAgent &&
              new Date(comment.createdAt).getTime() >=
                new Date(lastUserComment.createdAt).getTime()
          );

        if (lastMention) {
          const role = extractMention(lastMention.content);
          const hasReply = serverComments.some(
            (comment: TaskComment) =>
              comment.authorRole === role &&
              new Date(comment.createdAt).getTime() >=
                new Date(lastMention.createdAt).getTime()
          );
          const isFresh =
            Date.now() - new Date(lastMention.createdAt).getTime() < 10000;
          if (role && !hasReply && isFresh) {
            setPendingAgentRole(role);
          } else if (isQuestion && executorRole && !hasExecutorReplyAfterLastUser && lastUserComment && Date.now() - new Date(lastUserComment.createdAt).getTime() < 60000) {
            setPendingAgentRole(executorRole);
          } else {
            setPendingAgentRole(null);
          }
        } else if (isQuestion && executorRole && !hasExecutorReplyAfterLastUser && lastUserComment && Date.now() - new Date(lastUserComment.createdAt).getTime() < 60000) {
          setPendingAgentRole(executorRole);
        } else {
          setPendingAgentRole(null);
        }
      } catch (error) {
        console.error("[comments:load]", error);
      }
    }

    async function loadAttachments() {
      try {
        const response = await fetch(`/api/upload/task-attachment?taskId=${taskId}`);
        if (!response.ok) {
          return;
        }
        const payload = await response.json();
        if (!isMounted) {
          return;
        }
        const serverAttachments = Array.isArray(payload?.attachments) ? payload.attachments : [];
        setAttachments(serverAttachments);
      } catch (error) {
        console.error("[attachments:load]", error);
      }
    }

    async function loadTaskCost() {
      try {
        setTaskCostLoading(true);
        const response = await fetch(`/api/billing?taskId=${taskId}`);
        if (!response.ok) {
          return;
        }
        const payload = await response.json();
        if (!isMounted) {
          return;
        }
        setTaskCost(payload?.totalCost ?? 0);
      } catch (error) {
        console.error("[task:cost:load]", error);
      } finally {
        setTaskCostLoading(false);
      }
    }

    loadComments();
    loadAttachments();
    loadTaskCost();

    const interval = setInterval(loadComments, 3000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [task?.id, task?.executorAgent, isOpen]);

  const executorLabel = useMemo(
    () => executorAgent ?? "TEAMLEAD",
    [executorAgent]
  );

  async function updateTask(fields: Partial<TaskDetail>) {
    if (!task) {
      return false;
    }

    onTaskUpdate({ id: task.id, ...fields });

    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!response.ok) {
        throw new Error("Failed to update task");
      }
      toast({
        title: "Задача обновлена",
        description: "Изменения сохранены.",
      });
      return true;
    } catch (error) {
      console.error("[task:update]", error);
      toast({
        variant: "destructive",
        title: "Не удалось обновить задачу",
        description: "Попробуйте еще раз.",
      });
      return false;
    }
  }

  async function handleStatusChange(value: TaskDetail["status"]) {
    const previous = status;
    setStatus(value);
    const ok = await updateTask({ status: value });
    if (!ok) {
      setStatus(previous);
      if (task) {
        onTaskUpdate({ id: task.id, status: previous });
      }
    }
  }

  async function handleExecutorChange(value: TaskDetail["executorAgent"]) {
    const previous = executorAgent;
    setExecutorAgent(value);
    const ok = await updateTask({ executorAgent: value });
    if (!ok) {
      setExecutorAgent(previous);
      if (task) {
        onTaskUpdate({ id: task.id, executorAgent: previous ?? null });
      }
    }
  }

  async function handleDependenciesChange(nextDependencyIds: string[]) {
    if (!task) return false;
    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dependencyIds: nextDependencyIds }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error ?? "Failed to update dependencies");
      }
      const payload = await response.json();
      const updatedDeps = payload?.task?.dependencies ?? [];
      onTaskUpdate({ id: task.id, dependencies: updatedDeps });
      toast({
        title: "Зависимости обновлены",
        description: "Блокирующие задачи сохранены.",
      });
      return true;
    } catch (error) {
      console.error("[task:dependencies]", error);
      toast({
        variant: "destructive",
        title: "Не удалось обновить зависимости",
        description: "Попробуйте еще раз.",
      });
      return false;
    }
  }

  function toggleDependency(depTaskId: string) {
    const isCurrentlySelected = dependencyIds.includes(depTaskId);
    const nextIds = isCurrentlySelected
      ? dependencyIds.filter((id) => id !== depTaskId)
      : [...dependencyIds, depTaskId];
    void handleDependenciesChange(nextIds);
  }

  async function handleGeneratePrompt() {
    if (!task || isGenerating) {
      return;
    }

    setIsGenerating(true);

    try {
      // Force regenerate if prompt already exists
      const forceRegenerate = !!task.generatedPrompt;

      const response = await fetch("/api/generate-coding-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.id, forceRegenerate }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || "Не удалось сгенерировать промпт");
      }

      const payload = await response.json();
      const nextPrompt = typeof payload?.prompt === "string" ? payload.prompt : "";
      setPrompt(nextPrompt);
      if (task) {
        onTaskUpdate({ id: task.id, generatedPrompt: nextPrompt });
      }
      toast({
        title: "Промпт сгенерирован",
        description: "Можно копировать и использовать.",
      });
    } catch (error) {
      console.error("[task-prompt]", error);
      toast({
        variant: "destructive",
        title: "Не удалось сгенерировать промпт",
        description: "Попробуйте еще раз.",
      });
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleCopy() {
    if (!prompt) {
      return;
    }

    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.error("[task-prompt-copy]", error);
    }
  }

  async function handleShowQALogs() {
    if (!task || qaLogsLoading) {
      return;
    }

    setQaLogsLoading(true);
    try {
      const response = await fetch(`/api/tasks/${task.id}/qa-logs?taskId=${task.id}`);
      if (!response.ok) {
        throw new Error("Failed to fetch QA logs");
      }
      const data = await response.json();
      setQaLogs(data.logs || []);
      setQaLogsVisible(true);
    } catch (error) {
      console.error("[qa-logs]", error);
      toast({
        variant: "destructive",
        title: "Не удалось загрузить QA логи",
        description: "Попробуйте еще раз.",
      });
    } finally {
      setQaLogsLoading(false);
    }
  }

  async function handleFileUpload(file: File) {
    if (!task || isUploading) {
      return;
    }

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("taskId", task.id);

      const response = await fetch("/api/upload/task-attachment", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to upload file");
      }

      const payload = await response.json();
      if (payload.attachment) {
        setAttachments((current) => [payload.attachment, ...current]);
        toast({
          title: "Файл загружен",
          description: payload.attachment.visionAnalysis
            ? "Анализ дизайна завершен"
            : "Файл загружен без анализа",
        });
      }
    } catch (error) {
      console.error("[upload:error]", error);
      toast({
        variant: "destructive",
        title: "Не удалось загрузить файл",
        description: "Попробуйте еще раз.",
      });
    } finally {
      setIsUploading(false);
    }
  }

  function handleDragOver(event: React.DragEvent) {
    event.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(event: React.DragEvent) {
    event.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    setIsDragging(false);

    if (!task) {
      return;
    }

    const files = Array.from(event.dataTransfer.files);
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));

    if (imageFiles.length === 0) {
      toast({
        variant: "destructive",
        title: "Только изображения",
        description: "Пожалуйста, загрузите файлы изображений",
      });
      return;
    }

    imageFiles.forEach((file) => handleFileUpload(file));
  }

  async function handleDeleteAttachment(attachmentId: string) {
    if (!confirm("Удалить этот файл?")) {
      return;
    }

    try {
      const response = await fetch(`/api/upload/task-attachment?attachmentId=${attachmentId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete attachment");
      }

      setAttachments((current) => current.filter((a) => a.id !== attachmentId));
      toast({
        title: "Файл удален",
      });
    } catch (error) {
      console.error("[attachment:delete]", error);
      toast({
        variant: "destructive",
        title: "Не удалось удалить файл",
        description: "Попробуйте еще раз.",
      });
    }
  }

  async function handleUpdateVisionAnalysis(attachmentId: string, analysis: string) {
    try {
      const response = await fetch("/api/upload/task-attachment", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attachmentId, visionAnalysis: analysis }),
      });

      if (!response.ok) {
        throw new Error("Failed to update analysis");
      }

      setAttachments((current) =>
        current.map((a) =>
          a.id === attachmentId ? { ...a, visionAnalysis: analysis } : a
        )
      );

      setEditingAttachmentId(null);
      toast({
        title: "Анализ обновлен",
      });
    } catch (error) {
      console.error("[attachment:update]", error);
      toast({
        variant: "destructive",
        title: "Не удалось обновить анализ",
        description: "Попробуйте еще раз.",
      });
    }
  }

  async function handleSendComment() {
    if (!task || !commentInput.trim() || isSending) {
      return;
    }

    const content = commentInput.trim();
    const mentionedRole = extractMention(content);
    const optimisticComment: TaskComment = {
      id: `tmp-${Date.now()}`,
      content,
      authorRole: "TEAMLEAD",
      createdAt: new Date().toISOString(),
    };

    setComments((current) => [...current, optimisticComment]);
    setCommentInput("");
    setIsSending(true);
    requestAnimationFrame(() => {
      listEndRef.current?.scrollIntoView({ behavior: "smooth" });
    });
    if (mentionedRole) {
      setPendingAgentRole(mentionedRole);
    } else if (task.executorAgent && isQuestionToExecutor(content)) {
      setPendingAgentRole(task.executorAgent);
    }

    try {
      const response = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: task.id,
          content,
          authorRole: "TEAMLEAD",
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to send comment");
      }

      const payload = await response.json();
      const nextComments: TaskComment[] = [];

      if (payload?.comment) {
        nextComments.push(payload.comment);
      }

      if (payload?.agentComment) {
        nextComments.push(payload.agentComment);
        setPendingAgentRole(null);
      }

      setComments((current) => {
        const commentsMap = new Map<string, TaskComment>();
        current.forEach((c) => commentsMap.set(c.id, c));
        nextComments.forEach((c) => commentsMap.set(c.id, c));
        return Array.from(commentsMap.values()).sort((a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
      });
    } catch (error) {
      console.error("[comments:send]", error);
      toast({
        variant: "destructive",
        title: "Не удалось отправить сообщение",
        description: "Попробуйте еще раз.",
      });
      setComments((current) =>
        current.filter((item) => item.id !== optimisticComment.id)
      );
    } finally {
      setIsSending(false);
    }
  }

  return (
    <>
      <Sheet open={isOpen} onOpenChange={(open) => (!open ? onClose() : null)}>
        <SheetContent className="flex h-full flex-col p-0">
          {task ? (
            <>
              <SheetHeader className="border-b border-slate-200 px-6 py-4">
                <SheetTitle>{task.title}</SheetTitle>
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={status}
                  onValueChange={(value) =>
                    handleStatusChange(value as TaskDetail["status"])
                  }
                >
                  <SelectTrigger
                    className={cn(
                      "border-transparent",
                      statusBadgeStyles[status] ?? "bg-slate-100 text-slate-700"
                    )}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TODO">TODO</SelectItem>
                    <SelectItem value="IN_PROGRESS">IN_PROGRESS</SelectItem>
                    <SelectItem value="REVIEW">REVIEW</SelectItem>
                    <SelectItem value="WAITING_APPROVAL">WAITING_APPROVAL</SelectItem>
                    <SelectItem value="DONE">DONE</SelectItem>
                    <SelectItem value="REJECTED">REJECTED</SelectItem>
                  </SelectContent>
                </Select>

                <Badge className="gap-1 border-slate-300 bg-slate-50 text-slate-700">
                  <DollarSign className="h-3 w-3" />
                  {taskCostLoading ? (
                    <span className="text-xs">...</span>
                  ) : (
                    <span className="text-xs">${taskCost.toFixed(2)}</span>
                  )}
                </Badge>

                <DropdownMenu>
                  <DropdownMenuTrigger
                    className={cn(
                      "inline-flex items-center rounded-full border border-transparent px-2.5 py-0.5 text-xs font-semibold transition",
                      agentBadgeStyles[executorLabel] ??
                        "bg-slate-100 text-slate-700"
                    )}
                  >
                    {getExecutorDisplayLabel(executorLabel)}
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={() => handleExecutorChange("TASK_EXECUTOR")}>
                      Frontend
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExecutorChange("BACKEND")}>
                      Backend
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExecutorChange("DEVOPS")}>
                      DevOps
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </SheetHeader>

            <div className="px-6 pt-2 pb-2">
              <CopyIdButton id={task.id} label="Task ID" />
            </div>

            <div className="flex flex-1 flex-col min-h-0">
              <div className="flex-1 overflow-y-auto px-6 pb-4">
              <div className="space-y-4 pt-4">
              {task.branchName ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Branch Name
                  </p>
                  <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <code className="flex-1 truncate text-sm text-slate-700">
                      {task.branchName}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(task.branchName!);
                          setBranchCopied(true);
                          setTimeout(() => setBranchCopied(false), 1500);
                        } catch {}
                      }}
                    >
                      <Copy className="mr-1 h-4 w-4" />
                      {branchCopied ? "Скопировано" : "Копировать"}
                    </Button>
                  </div>
                </div>
              ) : null}

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Описание
                </p>
                <p className="mt-2 text-sm text-slate-600">{task.description}</p>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Блокирующие задачи
                </p>
                {incompleteDependencies.length > 0 ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    Blocked by:{" "}
                    {incompleteDependencies.map((d) => d.title).join(", ")}
                  </div>
                ) : null}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-between border-slate-200"
                    >
                      <span>
                        {dependencyIds.length === 0
                          ? "Выбрать блокирующие задачи"
                          : `Зависимостей: ${dependencyIds.length}`}
                      </span>
                      <ChevronDown className="h-4 w-4 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
                    {otherPlanTasks.length === 0 ? (
                      <p className="px-2 py-2 text-xs text-slate-500">
                        Нет других задач в плане
                      </p>
                    ) : (
                      otherPlanTasks.map((t) => (
                        <DropdownMenuCheckboxItem
                          key={t.id}
                          checked={dependencyIds.includes(t.id)}
                          onCheckedChange={() => toggleDependency(t.id)}
                        >
                          {t.title}
                        </DropdownMenuCheckboxItem>
                      ))
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    AI Agent Instructions
                  </p>
                  {prompt ? (
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={handleCopy}>
                          <Copy className="mr-2 h-4 w-4" />
                          {copied ? "Скопировано" : "Копировать"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-slate-500"
                          onClick={handleGeneratePrompt}
                          disabled={isGenerating}
                        >
                          Перегенерировать
                        </Button>
                        {task && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-slate-500"
                            onClick={handleShowQALogs}
                            disabled={qaLogsLoading}
                          >
                            <FileText className="mr-2 h-4 w-4" />
                            {qaLogsLoading ? "Загрузка..." : "QA Логи"}
                          </Button>
                        )}
                    </div>
                  ) : null}
                </div>

                {prompt ? (
                  <div className="rounded-lg bg-white p-3 text-xs text-slate-700 shadow-sm [&_pre]:whitespace-pre-wrap [&_pre]:my-2 [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:py-0.5 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:list-inside [&_ol]:list-decimal [&_ol]:list-inside">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{prompt}</ReactMarkdown>
                  </div>
                ) : (
                  <Button
                    onClick={handleGeneratePrompt}
                    disabled={isGenerating}
                    className="w-full"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Генерируем промпт...
                      </>
                    ) : (
                      "Сгенерировать промпт"
                    )}
                  </Button>
                )}
              </div>

              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Design / Attachments
                  </p>
                  <input
                    type="file"
                    id="file-upload"
                    className="hidden"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        handleFileUpload(file);
                        e.target.value = "";
                      }
                    }}
                    disabled={isUploading}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-slate-500"
                    onClick={() => document.getElementById("file-upload")?.click()}
                    disabled={isUploading}
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Загрузка...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        Upload Image
                      </>
                    )}
                  </Button>
                </div>

                {isDragging && (
                  <div className="rounded-lg border-2 border-dashed border-blue-400 bg-blue-50 p-8 text-center">
                    <ImageIcon className="mx-auto mb-2 h-8 w-8 text-blue-500" />
                    <p className="text-sm text-blue-700">Перетащите изображение сюда</p>
                  </div>
                )}

                {attachments.length === 0 && !isDragging ? (
                  <div
                    className="rounded-lg border-2 border-dashed border-slate-300 bg-slate-100 p-8 text-center transition hover:border-slate-400"
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                  >
                    <ImageIcon className="mx-auto mb-2 h-8 w-8 text-slate-400" />
                    <p className="text-sm text-slate-600">Drag & Drop изображение сюда</p>
                    <p className="mt-1 text-xs text-slate-500">или нажмите кнопку Upload</p>
                  </div>
                ) : null}

                <div className="space-y-3">
                  {attachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="rounded-lg border border-slate-200 bg-white overflow-hidden"
                    >
                      <div className="flex items-start gap-3 p-3 border-b border-slate-100">
                        <div className="relative h-16 w-16 rounded overflow-hidden border border-slate-200 bg-slate-100">
                          <Image
                            src={attachment.filePath}
                            alt={attachment.fileName}
                            fill
                            className="object-cover"
                            sizes="64px"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">
                            {attachment.fileName}
                          </p>
                          <p className="text-xs text-slate-500">
                            {new Date(attachment.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-slate-400 hover:text-red-500"
                          onClick={() => handleDeleteAttachment(attachment.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      {attachment.visionAnalysis ? (
                        <div className="p-3">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              AI Design Analysis
                            </p>
                            {editingAttachmentId !== attachment.id ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs text-slate-500 hover:text-slate-700"
                                onClick={() => {
                                  setEditingAttachmentId(attachment.id);
                                  setEditingVisionAnalysis(attachment.visionAnalysis ?? "");
                                }}
                              >
                                <Edit2 className="mr-1 h-3 w-3" />
                                Edit
                              </Button>
                            ) : (
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-xs text-slate-500 hover:text-green-600"
                                  onClick={() => handleUpdateVisionAnalysis(attachment.id, editingVisionAnalysis)}
                                >
                                  <Check className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-xs text-slate-500 hover:text-red-600"
                                  onClick={() => {
                                    setEditingAttachmentId(null);
                                    setEditingVisionAnalysis("");
                                  }}
                                >
                                  <XIcon className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                          </div>

                          {editingAttachmentId === attachment.id ? (
                            <textarea
                              value={editingVisionAnalysis}
                              onChange={(e) => setEditingVisionAnalysis(e.target.value)}
                              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300 resize-none"
                              rows={8}
                              placeholder="Edit AI design analysis..."
                            />
                          ) : (
                            <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700 [&_pre]:whitespace-pre-wrap [&_pre]:my-2 [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:py-0.5 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:list-inside [&_ol]:list-decimal [&_ol]:list-inside">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{attachment.visionAnalysis}</ReactMarkdown>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="p-3 text-center text-sm text-slate-500">
                          Нет AI-анализа
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Комментарии
                </p>
                <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                  {comments.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      Пока нет сообщений. Начните обсуждение.
                    </p>
                  ) : (
                    comments.map((comment) => {
                      const isUser = comment.authorRole === "TEAMLEAD";
                      return (
                        <div
                          key={comment.id}
                          className={cn(
                            "flex",
                            isUser ? "justify-end" : "justify-start"
                          )}
                        >
                          <div
                            className={cn(
                              "max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                              isUser
                                ? "bg-slate-900 text-white"
                                : "bg-slate-100 text-slate-700"
                            )}
                          >
                            {!isUser ? (
                              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                {comment.authorRole}
                              </p>
                            ) : null}
                            <div className="break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={commentMarkdownComponents(isUser)}
                              >
                                {comment.content}
                              </ReactMarkdown>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  {pendingAgentRole ? (
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span className="font-semibold">
                        {agentLabels[pendingAgentRole] ?? pendingAgentRole}
                      </span>
                      <span>is typing</span>
                      <span className="flex gap-1">
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
                      </span>
                    </div>
                  ) : null}
                  <div ref={listEndRef} />
                </div>
              </div>
            </div>
            </div>
            <div className="flex-shrink-0 border-t border-slate-200 bg-white px-6 py-4">
                <div className="flex items-center gap-2">
                  <Input
                    type="text"
                    value={commentInput}
                    onChange={(event) => setCommentInput(event.target.value)}
                    placeholder="Сообщение, ping, или вопрос (например: почему pymupdf?)..."
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        handleSendComment();
                      }
                    }}
                  />
                  <Button
                    onClick={handleSendComment}
                    disabled={isSending || !commentInput.trim()}
                    className="h-10 px-3"
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
          </>
        ) : null}
      </SheetContent>
    </Sheet>

    {qaLogsVisible && task && (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] flex flex-col">
          <div className="flex items-center justify-between p-4 border-b">
            <h3 className="text-lg font-semibold">QA Логи: {task.title}</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setQaLogsVisible(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 bg-slate-50 font-mono text-xs">
            {qaLogs.length > 0 ? (
              qaLogs.map((log, index) => (
                <div key={index} className="mb-2 pb-2 border-b border-slate-200 last:border-0">
                  {log.split(']').slice(1).map((part, i) => {
                    if (i === 0) {
                      return <span key={`header-${index}-${i}`} className="text-slate-500 mr-2">[{part}]</span>;
                    }
                    const content = log.split(']').slice(1).join(']');
                    return <span key={`content-${index}-${i}`} className="text-slate-800">{content}</span>;
                  })}
                </div>
              ))
            ) : (
              <div className="text-slate-500 text-center py-8">
                {qaLogsLoading ? "Загрузка логов..." : "Нет логов для этой задачи"}
              </div>
            )}
          </div>
          <div className="p-4 border-t flex justify-end">
            <Button onClick={() => setQaLogsVisible(false)}>
              Закрыть
            </Button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
