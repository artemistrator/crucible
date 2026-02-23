"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Github, Image as ImageIcon, Loader2, Shield, ShieldCheck, ShieldOff, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

const SAVE_DEBOUNCE_MS = 2000;

export function ProjectContextSheet({
  projectId,
  initialContext,
  initialGithubRepo,
  initialRequireApproval,
  open,
  onOpenChange,
}: {
  projectId: string;
  initialContext: string;
  initialGithubRepo?: string | null;
  initialRequireApproval?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [value, setValue] = useState(initialContext);
  const [githubRepo, setGithubRepo] = useState(initialGithubRepo ?? "");
  const [requireApproval, setRequireApproval] = useState(initialRequireApproval ?? false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [files, setFiles] = useState<
    { id: string; name: string; url: string; mimeType: string }[]
  >([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef(initialContext);
  const lastRequireApprovalRef = useRef(initialRequireApproval ?? false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { toast } = useToast();

  // Sync from server when sheet opens
  const loadFiles = useCallback(async () => {
    setFilesLoading(true);
    try {
      const res = await fetch(`/api/upload?projectId=${projectId}`);
      if (!res.ok) {
        throw new Error("Failed to load files");
      }
      const data = await res.json();
      setFiles(Array.isArray(data?.files) ? data.files : []);
    } catch (e) {
      toast({
        title: "Ошибка загрузки файлов",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setFilesLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => {
    if (open) {
      setValue(initialContext);
      setGithubRepo(initialGithubRepo ?? "");
      setRequireApproval(initialRequireApproval ?? false);
      lastSavedRef.current = initialContext;
      lastRequireApprovalRef.current = initialRequireApproval ?? false;
      loadFiles();
    }
  }, [open, initialContext, initialGithubRepo, initialRequireApproval, loadFiles]);

  const save = useCallback(
    async (context: string, repo: string, approval: boolean) => {
      const contextChanged = context !== lastSavedRef.current;
      const repoValue = repo.trim() || null;
      const approvalChanged = approval !== lastRequireApprovalRef.current;
      if (!contextChanged && repoValue === (initialGithubRepo ?? "") && !approvalChanged) return;
      setSaving(true);
      try {
        const body: { context?: string; githubRepo?: string | null; requireApproval?: boolean } = {};
        if (contextChanged) body.context = context;
        body.githubRepo = repoValue;
        if (approvalChanged) body.requireApproval = approval;
        const res = await fetch(`/api/projects/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error ?? "Failed to save");
        }
        if (contextChanged) lastSavedRef.current = context;
        if (approvalChanged) lastRequireApprovalRef.current = approval;
        setSaved(true);
        toast({ title: "Сохранено", variant: "default" });
        setTimeout(() => setSaved(false), 2000);
      } catch (e) {
        toast({
          title: "Ошибка сохранения",
          description: e instanceof Error ? e.message : "Unknown error",
          variant: "destructive",
        });
      } finally {
        setSaving(false);
      }
    },
    [projectId, initialGithubRepo, toast]
  );

  const scheduleSave = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      save(value, githubRepo, requireApproval);
    }, SAVE_DEBOUNCE_MS);
  }, [value, githubRepo, requireApproval, save]);

  const handleBlur = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
      save(value, githubRepo, requireApproval);
    } else if (value !== lastSavedRef.current || githubRepo !== (initialGithubRepo ?? "") || requireApproval !== lastRequireApprovalRef.current) {
      save(value, githubRepo, requireApproval);
    }
  }, [value, githubRepo, requireApproval, initialGithubRepo, lastRequireApprovalRef, save]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setValue(e.target.value);
      scheduleSave();
    },
    [scheduleSave]
  );

  const handleGithubRepoBlur = useCallback(() => {
    if (githubRepo !== (initialGithubRepo ?? "")) {
      save(value, githubRepo, requireApproval);
    }
  }, [githubRepo, initialGithubRepo, value, requireApproval, save]);

  const handleUpload = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("projectId", projectId);

        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error ?? "Failed to upload");
        }

        const data = await res.json();
        if (data?.file) {
          setFiles((current) => [data.file, ...current]);
        }
        toast({ title: "Файл загружен" });
      } catch (e) {
        toast({
          title: "Ошибка загрузки",
          description: e instanceof Error ? e.message : "Unknown error",
          variant: "destructive",
        });
      } finally {
        setUploading(false);
      }
    },
    [projectId, toast]
  );

  const handleDelete = useCallback(
    async (fileId: string) => {
      try {
        const res = await fetch("/api/upload", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileId }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error ?? "Failed to delete");
        }
        setFiles((current) => current.filter((file) => file.id !== fileId));
        toast({ title: "Файл удалён" });
      } catch (e) {
        toast({
          title: "Ошибка удаления",
          description: e instanceof Error ? e.message : "Unknown error",
          variant: "destructive",
        });
      }
    },
    [toast]
  );

  const renderFileIcon = (mimeType: string) => {
    if (mimeType.startsWith("image/")) {
      return <ImageIcon className="h-4 w-4 text-slate-500" />;
    }
    return <FileText className="h-4 w-4 text-slate-500" />;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col gap-4">
        <SheetHeader>
          <SheetTitle>Глобальный контекст проекта</SheetTitle>
          <SheetDescription>
            Технические решения и договорённости по проекту. Учитываются при
            генерации промптов и ответах агентов.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-6 min-h-0 overflow-y-auto pr-1">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
              <Github className="h-4 w-4" />
              GitHub Repository
            </label>
            <input
              type="text"
              value={githubRepo}
              onChange={(e) => setGithubRepo(e.target.value)}
              onBlur={handleGithubRepoBlur}
              placeholder="https://github.com/user/repo или user/repo"
              className={cn(
                "w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400",
                "focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-1"
              )}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex items-center gap-2">
              {requireApproval ? (
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
              ) : (
                <ShieldOff className="h-5 w-5 text-slate-400" />
              )}
              <div>
                <p className="text-sm font-medium text-slate-900">
                  Human-in-the-Loop
                </p>
                <p className="text-xs text-slate-500">
                  Требовать подтверждение перед завершением задачи
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setRequireApproval(!requireApproval);
                save(value, githubRepo, !requireApproval);
              }}
              disabled={saving}
              className={cn(
                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2",
                "disabled:cursor-not-allowed disabled:opacity-50",
                requireApproval ? "bg-emerald-600" : "bg-slate-200"
              )}
            >
              <span
                className={cn(
                  "inline-block h-5 w-5 transform rounded-full bg-white transition-transform",
                  requireApproval ? "translate-x-6" : "translate-x-0"
                )}
              />
            </button>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Контекст</label>
          <textarea
            value={value}
            onChange={handleChange}
            onBlur={handleBlur}
            placeholder="Например: Используем Next.js App Router. Стейт — Zustand. API — tRPC."
            className={cn(
              "flex-1 min-h-[200px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400",
              "focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-1",
              "resize-y"
            )}
          />
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            {saving && <span>Сохранение…</span>}
            {saved && !saving && (
              <span className="text-emerald-600">Сохранено</span>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-800">Files</p>
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      handleUpload(file);
                      event.target.value = "";
                    }
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  Upload
                </Button>
              </div>
            </div>

            <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
              {filesLoading ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Загружаем файлы...
                </div>
              ) : files.length === 0 ? (
                <p className="text-sm text-slate-500">Файлы еще не загружены.</p>
              ) : (
                files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2 text-sm text-slate-700"
                  >
                    <div className="flex items-center gap-2">
                      {renderFileIcon(file.mimeType)}
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noreferrer"
                        className="max-w-[220px] truncate hover:underline"
                        title={file.name}
                      >
                        {file.name}
                      </a>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(file.id)}
                    >
                      <Trash2 className="h-4 w-4 text-slate-400" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function ProjectContextTrigger({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <Button variant="outline" size="sm" onClick={onClick}>
      Project Context
    </Button>
  );
}

export function ProjectContextButton({
  projectId,
  initialContext,
  initialGithubRepo,
  initialRequireApproval,
}: {
  projectId: string;
  initialContext: string;
  initialGithubRepo?: string | null;
  initialRequireApproval?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ProjectContextTrigger onClick={() => setOpen(true)} />
      <ProjectContextSheet
        projectId={projectId}
        initialContext={initialContext}
        initialGithubRepo={initialGithubRepo}
        initialRequireApproval={initialRequireApproval}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
