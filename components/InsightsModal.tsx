"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, Tag, Trash2, Edit2, X, Lightbulb, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

interface Insight {
  id: string;
  content: string;
  tags: string[];
  createdAt: string;
}

interface Metrics {
  projects: {
    total: number;
    activeLast7Days: number;
  };
  tasks: {
    total: number;
    completed: number;
    byStatus: Record<string, number>;
  };
  insights: {
    total: number;
    popularTechnologies: Array<{ name: string; count: number }>;
  };
  costs: {
    totalCost: number;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalCalls: number;
  };
}

export default function InsightsModal() {
  const [open, setOpen] = useState(false);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [editingInsight, setEditingInsight] = useState<Insight | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { toast } = useToast();

  const loadInsights = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (query) params.append("query", query);
      if (selectedTag) params.append("tag", selectedTag);

      const res = await fetch(`/api/insights?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch insights");
      const data = await res.json();
      setInsights(data.insights || []);
    } catch (error) {
      toast({
        title: "Ошибка загрузки",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [query, selectedTag, toast]);

  const loadMetrics = useCallback(async () => {
    try {
      const res = await fetch("/api/metrics");
      if (!res.ok) throw new Error("Failed to fetch metrics");
      const data = await res.json();
      setMetrics(data);
    } catch (error) {
      console.error("[metrics load]", error);
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadInsights();
      loadMetrics();
    }
  }, [open, loadInsights, loadMetrics]);

  useEffect(() => {
    if (open) {
      loadInsights();
    }
  }, [query, selectedTag]);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch("/api/insights", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error("Failed to delete insight");
      setInsights((prev) => prev.filter((i) => i.id !== id));
      toast({ title: "Инсайт удалён" });
      loadMetrics();
    } catch (error) {
      toast({
        title: "Ошибка удаления",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleEdit = (insight: Insight) => {
    setEditingInsight(insight);
    setEditContent(insight.content);
    setEditTags([...insight.tags]);
  };

  const handleSaveEdit = async () => {
    if (!editingInsight) return;

    try {
      const res = await fetch("/api/insights", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingInsight.id,
          content: editContent,
          tags: editTags,
        }),
      });
      if (!res.ok) throw new Error("Failed to update insight");

      setInsights((prev) =>
        prev.map((i) =>
          i.id === editingInsight.id
            ? { ...i, content: editContent, tags: editTags }
            : i
        )
      );
      setEditingInsight(null);
      toast({ title: "Инсайт обновлён" });
      loadMetrics();
    } catch (error) {
      toast({
        title: "Ошибка обновления",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const handleAddTag = () => {
    if (newTag && !editTags.includes(newTag)) {
      setEditTags([...editTags, newTag]);
      setNewTag("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setEditTags(editTags.filter((t) => t !== tagToRemove));
  };

  const allTags = Array.from(
    new Set(insights.flatMap((i) => i.tags))
  ).sort();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" className="w-full justify-start text-slate-600 hover:text-slate-900">
          <Lightbulb className="mr-2 h-4 w-4" />
          Инсайты
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[600px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Инсайты и Метрики</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {metrics && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
                Метрики
              </h3>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border bg-white p-3">
                  <p className="text-xs font-medium text-slate-500">Проектов всего</p>
                  <p className="text-xl font-semibold">{metrics.projects.total}</p>
                </div>

                <div className="rounded-lg border bg-white p-3">
                  <p className="text-xs font-medium text-slate-500">Активных (7 дней)</p>
                  <p className="text-xl font-semibold">{metrics.projects.activeLast7Days}</p>
                </div>

                <div className="rounded-lg border bg-white p-3">
                  <p className="text-xs font-medium text-slate-500">Задач</p>
                  <p className="text-xl font-semibold">{metrics.tasks.total}</p>
                  <p className="text-xs text-slate-500">Выполнено: {metrics.tasks.completed}</p>
                </div>

                <div className="rounded-lg border bg-white p-3">
                  <p className="text-xs font-medium text-slate-500">Инсайтов</p>
                  <p className="text-xl font-semibold">{metrics.insights.total}</p>
                </div>

                <div className="rounded-lg border bg-white p-3 sm:col-span-2">
                  <p className="text-xs font-medium text-slate-500">Общая стоимость</p>
                  <p className="text-xl font-semibold">${metrics.costs.totalCost.toFixed(4)}</p>
                  <p className="text-xs text-slate-500">
                    {metrics.costs.totalCalls.toLocaleString()} вызовов •{" "}
                    {(metrics.costs.totalPromptTokens + metrics.costs.totalCompletionTokens).toLocaleString()} токенов
                  </p>
                </div>
              </div>

              {metrics.insights.popularTechnologies.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Популярные технологии
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {metrics.insights.popularTechnologies.map((tech) => (
                      <Badge key={tech.name} variant="secondary">
                        {tech.name} ({tech.count})
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              Инсайты
            </h3>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Поиск по контенту..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {allTags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedTag ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setSelectedTag(null)}
                  >
                    <X className="mr-1 h-3 w-3" />
                    {selectedTag}
                  </Button>
                ) : (
                  allTags.slice(0, 10).map((tag) => (
                    <Badge
                      key={tag}
                      variant="outline"
                      className="cursor-pointer hover:bg-slate-100"
                      onClick={() => setSelectedTag(tag)}
                    >
                      <Tag className="mr-1 h-3 w-3" />
                      {tag}
                    </Badge>
                  ))
                )}
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : insights.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                {query || selectedTag
                  ? "Нет совпадений"
                  : "Инсайты пока не сохранены"}
              </div>
            ) : (
              <div className="space-y-3">
                {insights.map((insight) => (
                  <div
                    key={insight.id}
                    className="rounded-lg border bg-white p-4 shadow-sm"
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="flex flex-wrap gap-1">
                        {insight.tags.map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleEdit(insight)}
                        >
                          <Edit2 className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-red-500 hover:text-red-600"
                          onClick={() => handleDelete(insight.id)}
                          disabled={deletingId === insight.id}
                        >
                          {deletingId === insight.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    </div>
                    <p className="text-sm text-slate-700">{insight.content}</p>
                    <p className="mt-2 text-xs text-slate-400">
                      {new Date(insight.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </SheetContent>

      <AlertDialog open={!!editingInsight} onOpenChange={() => setEditingInsight(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Редактировать инсайт</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium">Контент</label>
              <textarea
                className="min-h-[100px] w-full rounded-md border border-slate-200 bg-white p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">Теги</label>
              <div className="mb-2 flex gap-2">
                <Input
                  placeholder="Новый тег"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                />
                <Button type="button" onClick={handleAddTag}>
                  Добавить
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {editTags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="hover:text-red-500"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setEditingInsight(null)}>
              Отмена
            </AlertDialogCancel>
            <Button onClick={handleSaveEdit}>Сохранить</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}
