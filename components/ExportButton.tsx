"use client";

import { useState } from "react";
import { Download, Package, Code, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";

type ExportType = "full" | "build" | "source";

export interface ExportButtonProps {
  projectId: string;
  projectName?: string;
  status?: string;
}

export function ExportButton({ projectId, projectName, status }: ExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportType, setExportType] = useState<ExportType>("full");
  const { toast } = useToast();

  const isCompleted = status === "COMPLETED";
  const canExport = isCompleted && !isExporting;

  async function handleExport(type: ExportType) {
    setIsExporting(true);

    try {
      const response = await fetch(`/api/projects/${projectId}/export?type=${type}`);

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error || "Failed to export project");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = response.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] || `project-export-${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Экспорт выполнен",
        description: `Проект "${projectName || projectId}" успешно экспортирован.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Произошла ошибка";
      toast({
        variant: "destructive",
        title: "Не удалось экспортировать проект",
        description: message,
      });
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={!canExport}
          className="gap-2"
          title={!isCompleted ? "Finish all tasks to enable export" : undefined}
        >
          {isExporting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Экспорт...</span>
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              <span>Экспорт</span>
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-3 py-2 text-xs font-semibold text-slate-500">
          Выберите тип экспорта
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => handleExport("source")}
          disabled={isExporting}
          className="cursor-pointer"
        >
          <Code className="mr-2 h-4 w-4 text-slate-500" />
          <div className="flex flex-col">
            <span className="font-medium">Download Source Code (.zip)</span>
            <span className="text-xs text-slate-500">Исходный код без node_modules</span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleExport("build")}
          disabled={isExporting}
          className="cursor-pointer"
        >
          <Package className="mr-2 h-4 w-4 text-slate-500" />
          <div className="flex flex-col">
            <span className="font-medium">Download Build Artifacts (.zip)</span>
            <span className="text-xs text-slate-500">dist/, .next/, build/</span>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
