"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/use-toast";
import InsightsModal from "@/components/InsightsModal";

interface Project {
  id: string;
  ideaText: string;
  createdAt: string;
}

function truncateIdea(text: string, maxLength: number) {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}...`;
}

export default function ProjectSidebar() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const loadProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error("Failed to load projects");
      const data = await res.json();
      setProjects(data || []);
    } catch (error) {
      toast({
        title: "Ошибка загрузки проектов",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const handleDelete = useCallback(
    async (projectId: string) => {
      setDeletingProjectId(projectId);
      try {
        const res = await fetch(`/api/projects/${projectId}`, {
          method: "DELETE"
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error ?? "Failed to delete project");
        }
        const data = await res.json();
        setProjects((prev) => prev.filter((p) => p.id !== projectId));
        toast({
          title: "Проект удалён",
          description: `Сохранено ${data.learnedInsights?.length || 0} инсайтов`
        });
        router.push("/");
      } catch (error) {
        toast({
          title: "Ошибка удаления",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive"
        });
      } finally {
        setDeletingProjectId(null);
      }
    },
    [toast, router]
  );

  return (
    <aside
      className={`relative flex h-screen flex-col border-r border-slate-200 bg-white/80 py-6 transition-all duration-300 ease-in-out dark:border-slate-800 dark:bg-slate-950 ${
        isCollapsed ? "w-14 px-2" : "w-72 px-5"
      }`}
    >
      <button
        type="button"
        aria-label={isCollapsed ? "Развернуть сайдбар" : "Свернуть сайдбар"}
        onClick={() => setIsCollapsed((prev) => !prev)}
        className="absolute -right-3 top-6 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        {isCollapsed ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <ChevronLeft className="h-4 w-4" />
        )}
      </button>

      {!isCollapsed && (
        <>
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">
              Projects
            </p>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">История</h2>
          </div>

          <nav className="mb-6 flex-1 space-y-2 overflow-y-auto pr-1">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : projects.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                Пока нет сохраненных проектов.
              </div>
            ) : (
              projects.map((project) => (
                <div key={project.id} className="group flex items-center gap-2">
                  <Link
                    href={`/project/${project.id}`}
                    className="block flex-1 rounded-lg border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-slate-500 dark:hover:bg-slate-800"
                    title={project.ideaText}
                  >
                    {truncateIdea(project.ideaText, 30)}
                  </Link>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        <Trash2 className="h-4 w-4 text-slate-400 hover:text-red-500" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Удалить проект?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Вы уверены? Проект будет проанализирован, знания сохранены, а данные
                          удалены.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Отмена</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(project.id)}
                          disabled={deletingProjectId === project.id}
                          className="gap-2"
                        >
                          {deletingProjectId === project.id ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Удаление...
                            </>
                          ) : (
                            "Удалить"
                          )}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))
            )}
          </nav>

      <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">
              Knowledge
            </p>
            <InsightsModal />
          </div>
        </>
      )}
    </aside>
  );
}
