"use client";

import { useState, useEffect, useCallback } from "react";
import { Bug, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type TicketStatus = "OPEN" | "IN_PROGRESS" | "DONE" | "REJECTED";

export type Ticket = {
  id: string;
  projectId: string;
  relatedTaskId: string | null;
  title: string;
  description: string;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
};

const statusBadgeStyles: Record<TicketStatus, string> = {
  OPEN: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-700",
  IN_PROGRESS: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-700",
  DONE: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-700",
  REJECTED: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-200 dark:border-red-700",
};

const statusLabels: Record<TicketStatus, string> = {
  OPEN: "Открыт",
  IN_PROGRESS: "В работе",
  DONE: "Готов",
  REJECTED: "Отклонён",
};

function formatTicketNum(index: number) {
  return `#${String(index + 1).padStart(3, "0")}`;
}

interface ProjectTicketsTabProps {
  projectId: string;
  onCountChange?: (count: number) => void;
}

export default function ProjectTicketsTab({ projectId, onCountChange }: ProjectTicketsTabProps) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createRelatedTaskId, setCreateRelatedTaskId] = useState<string | null>(null);
  const [projectTasks, setProjectTasks] = useState<{ id: string; title: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [ticketComments, setTicketComments] = useState<{ id: string; content: string; authorRole: string; createdAt: string }[]>([]);
  const [ticketCommentsLoading, setTicketCommentsLoading] = useState(false);
  const [ticketCommentInput, setTicketCommentInput] = useState("");
  const [ticketCommentSending, setTicketCommentSending] = useState(false);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tickets?projectId=${encodeURIComponent(projectId)}`);
      if (!res.ok) throw new Error("Failed to fetch tickets");
      const data = await res.json();
      const list = Array.isArray(data.tickets) ? data.tickets : [];
      setTickets(list);
      onCountChange?.(list.length);
    } catch (e) {
      console.error("[ProjectTicketsTab] Failed to fetch tickets:", e);
      setTickets([]);
      onCountChange?.(0);
    } finally {
      setLoading(false);
    }
  }, [projectId, onCountChange]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  // Poll tickets every 5s when sheet is open so status updates without switching tabs
  useEffect(() => {
    if (!sheetOpen) return;
    const interval = setInterval(fetchTickets, 5000);
    return () => clearInterval(interval);
  }, [sheetOpen, fetchTickets]);

  // When any ticket is IN_PROGRESS, poll list every 5s so cards update during pipeline
  const hasInProgress = tickets.some((t) => t.status === "IN_PROGRESS");
  useEffect(() => {
    if (!hasInProgress) return;
    const interval = setInterval(fetchTickets, 5000);
    return () => clearInterval(interval);
  }, [hasInProgress, fetchTickets]);

  useEffect(() => {
    if (!createModalOpen || !projectId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/plans");
        if (!res.ok) return;
        const plans: { id: string; projectId: string; tasks: { id: string; title: string }[] }[] = await res.json();
        const projectPlans = (Array.isArray(plans) ? plans : []).filter((p) => p.projectId === projectId);
        const firstPlan = projectPlans[0];
        const tasks = firstPlan?.tasks ?? [];
        if (!cancelled) setProjectTasks(Array.isArray(tasks) ? tasks : []);
      } catch {
        if (!cancelled) setProjectTasks([]);
      }
    })();
    return () => { cancelled = true; };
  }, [createModalOpen, projectId]);

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createTitle.trim() || !createDescription.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          title: createTitle.trim(),
          description: createDescription.trim(),
          relatedTaskId: createRelatedTaskId && createRelatedTaskId !== "__none__" ? createRelatedTaskId : null,
        }),
      });
      if (!res.ok) throw new Error("Failed to create ticket");
      setCreateModalOpen(false);
      setCreateTitle("");
      setCreateDescription("");
      setCreateRelatedTaskId(null);
      await fetchTickets();
    } catch (err) {
      console.error("[ProjectTicketsTab] Failed to create ticket:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRowClick = (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setSheetOpen(true);
  };

  // Fetch comments for the related task when ticket sheet is open
  useEffect(() => {
    const taskId = selectedTicket?.relatedTaskId;
    if (!sheetOpen || !taskId) {
      setTicketComments([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setTicketCommentsLoading(true);
      try {
        const res = await fetch(`/api/comments?taskId=${encodeURIComponent(taskId)}`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const list = Array.isArray(data?.comments) ? data.comments : [];
        if (!cancelled) setTicketComments(list);
      } catch {
        if (!cancelled) setTicketComments([]);
      } finally {
        if (!cancelled) setTicketCommentsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sheetOpen, selectedTicket?.id, selectedTicket?.relatedTaskId]);

  const handleSendTicketComment = async () => {
    const taskId = selectedTicket?.relatedTaskId;
    if (!taskId || !ticketCommentInput.trim() || ticketCommentSending) return;
    const content = ticketCommentInput.trim();
    setTicketCommentInput("");
    setTicketCommentSending(true);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, content, authorRole: "TEAMLEAD" }),
      });
      if (!res.ok) throw new Error("Failed to send comment");
      const data = await res.json().catch(() => ({}));
      const toAdd = [data?.comment, data?.agentComment].filter(Boolean);
      if (toAdd.length > 0) {
        setTicketComments((prev) => [...prev, ...toAdd]);
      }
    } catch {
      setTicketCommentInput(content);
    } finally {
      setTicketCommentSending(false);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  const doneCount = tickets.filter((t) => t.status === "DONE").length;

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--pp-muted)]">
            ТИКЕТЫ{" "}
            <span className="text-xs font-normal">
              {doneCount} из {tickets.length} закрыто
            </span>
          </p>
          <Button
            size="sm"
            className="gap-2 bg-[var(--pp-accent)] text-[var(--pp-bg)] hover:opacity-90"
            onClick={() => {
              setCreateTitle("");
              setCreateDescription("");
              setCreateModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            + Тикет
          </Button>
        </div>

        {loading ? (
          <p className="py-8 text-center text-sm text-[var(--pp-muted)]">
            Загрузка тикетов...
          </p>
        ) : tickets.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--pp-border)] py-12 text-center">
            <Bug className="mx-auto h-12 w-12 text-[var(--pp-muted)]" />
            <p className="mt-2 text-sm font-medium text-[var(--pp-text)]">
              Тикетов пока нет
            </p>
            <p className="mt-1 text-xs text-[var(--pp-muted)]">
              Создайте тикет для багов или доработок
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-4 border-[var(--pp-border)] text-[var(--pp-muted)]"
              onClick={() => setCreateModalOpen(true)}
            >
              + Тикет
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {tickets.map((ticket, index) => (
              <button
                key={ticket.id}
                type="button"
                className="flex w-full cursor-pointer items-start gap-3.5 rounded-lg border border-slate-200 bg-white px-4 py-3.5 text-left shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900/60"
                onClick={() => handleRowClick(ticket)}
              >
                <span className="min-w-[36px] font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  {formatTicketNum(index)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-slate-900 dark:text-slate-50">
                    {ticket.title}
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-xs leading-snug text-slate-500 dark:text-slate-400">
                    {ticket.description}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {ticket.relatedTaskId && (
                      <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                        Задача
                      </span>
                    )}
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-[4px] px-2 py-1 font-mono text-[10px] font-semibold tracking-[0.14em]",
                        statusBadgeStyles[ticket.status as TicketStatus] ??
                          "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                      )}
                    >
                      <span
                        className={cn(
                          "inline-block h-2 w-2 rounded-full",
                          ticket.status === "DONE" && "bg-emerald-500",
                          ticket.status === "IN_PROGRESS" && "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.7)]",
                          ticket.status === "OPEN" && "bg-slate-400",
                          ticket.status === "REJECTED" && "bg-red-500"
                        )}
                      />
                      {statusLabels[ticket.status as TicketStatus] ?? ticket.status}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Новый тикет</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleCreateTicket}>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-200">
                Заголовок
              </label>
              <Input
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                placeholder="Краткое описание"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-200">
                Описание
              </label>
              <textarea
                className="min-h-[120px] w-full rounded-md border border-slate-200 bg-background px-3 py-2 text-sm text-slate-900 shadow-sm ring-offset-background placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus-visible:ring-slate-500"
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                placeholder="Опишите баг или доработку..."
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-200">
                Привязать к задаче (для auto execution)
              </label>
              <Select
                value={createRelatedTaskId ?? "__none__"}
                onValueChange={(v) => setCreateRelatedTaskId(v === "__none__" ? null : v)}
              >
                <SelectTrigger className="w-full rounded-md border border-slate-200 bg-background dark:border-slate-700 dark:bg-slate-900">
                  <SelectValue placeholder="Не привязывать" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Не привязывать</SelectItem>
                  {projectTasks.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                Тикет без привязки не будет автоматически выполняться при Start auto execution.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCreateModalOpen(false)}
                disabled={submitting}
              >
                Отмена
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={submitting || !createTitle.trim() || !createDescription.trim()}
              >
                {submitting ? "Создаём..." : "Создать тикет"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>
              {selectedTicket ? (
                <span className="line-clamp-2">{selectedTicket.title}</span>
              ) : (
                "Тикет"
              )}
            </SheetTitle>
          </SheetHeader>
          {selectedTicket && (
            <div className="mt-6 space-y-4">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Статус
                </p>
                <Badge
                  variant="outline"
                  className={cn(
                    statusBadgeStyles[selectedTicket.status as TicketStatus] ??
                      "bg-slate-100 text-slate-700"
                  )}
                >
                  {statusLabels[selectedTicket.status as TicketStatus] ??
                    selectedTicket.status}
                </Badge>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Создан
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {formatDate(selectedTicket.createdAt)}
                </p>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Описание
                </p>
                <div className="whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                  {selectedTicket.description}
                </div>
              </div>
              {selectedTicket.relatedTaskId && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Комментарии по задаче (логи работы)
                  </p>
                  {ticketCommentsLoading ? (
                    <p className="text-sm text-slate-500">Загрузка…</p>
                  ) : (
                    <div className="space-y-3">
                      <div className="max-h-48 overflow-y-auto space-y-2 rounded-md border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-700 dark:bg-slate-900/50">
                        {ticketComments.length === 0 ? (
                          <p className="text-xs text-slate-500">Пока нет комментариев. Отчёт исполнителя и комментарии по задаче появятся здесь.</p>
                        ) : (
                          ticketComments.map((c) => (
                            <div
                              key={c.id}
                              className="rounded border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                            >
                              <span className="font-mono text-[10px] text-slate-400">{c.authorRole}</span>
                              <p className="mt-0.5 whitespace-pre-wrap text-slate-700 dark:text-slate-200">{c.content}</p>
                              <p className="mt-1 text-[10px] text-slate-400">
                                {formatDate(c.createdAt)}
                              </p>
                            </div>
                          ))
                        )}
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Добавить комментарий (что сделано, почему…)"
                          className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:placeholder:text-slate-500"
                          value={ticketCommentInput}
                          onChange={(e) => setTicketCommentInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              handleSendTicketComment();
                            }
                          }}
                        />
                        <Button
                          size="sm"
                          disabled={!ticketCommentInput.trim() || ticketCommentSending}
                          onClick={handleSendTicketComment}
                        >
                          {ticketCommentSending ? "…" : "Отправить"}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {(selectedTicket.status === "REJECTED" || selectedTicket.status === "IN_PROGRESS") && (
                <div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={reopening}
                    onClick={async () => {
                      setReopening(true);
                      try {
                        const res = await fetch(`/api/tickets/${selectedTicket.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ status: "OPEN" }),
                        });
                        if (res.ok) {
                          setSelectedTicket((t) => (t ? { ...t, status: "OPEN" } : t));
                          await fetchTickets();
                        }
                      } finally {
                        setReopening(false);
                      }
                    }}
                  >
                    {reopening ? "Открываем…" : "Открыть снова"}
                  </Button>
                  <p className="mt-1 text-[10px] text-slate-500">
                    Тикет снова будет участвовать в auto execution.
                  </p>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
