"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

export function GenerateTasksButton({
  planId,
  projectId,
  label = "Generate Tasks & Start",
  onGenerated,
  onGenerateStart,
  disabled,
  isGenerating: controlledGenerating,
}: {
  planId: string;
  projectId: string;
  label?: string;
  /** If set, do not navigate; call this after success so parent can e.g. slide to tasks view */
  onGenerated?: () => void;
  /** Called when generate is starting (so parent can show loading during delay + slide) */
  onGenerateStart?: () => void;
  disabled?: boolean;
  /** When using onGenerated, parent can control loading so it can show loading during slide delay */
  isGenerating?: boolean;
}) {
  const [internalGenerating, setInternalGenerating] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const isGenerating = controlledGenerating ?? internalGenerating;

  async function handleClick() {
    if (isGenerating || disabled) {
      return;
    }

    onGenerateStart?.();
    if (controlledGenerating === undefined) {
      setInternalGenerating(true);
    }

    try {
      const response = await fetch("/api/generate-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || "Не удалось сгенерировать задачи");
      }

      if (onGenerated) {
        onGenerated();
        // Parent controls loading; do not set internal false
      } else {
        router.push(`/project/${projectId}/plan/${planId}`);
        setInternalGenerating(false);
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Не удалось сгенерировать задачи",
        description: error instanceof Error ? error.message : "Произошла ошибка",
      });
      setInternalGenerating(false);
    } finally {
      if (!onGenerated) {
        setInternalGenerating(false);
      }
    }
  }

  return (
    <Button
      size="sm"
      onClick={handleClick}
      disabled={disabled ?? isGenerating}
      className="h-9 bg-[var(--pp-accent)] text-[var(--pp-bg)] hover:opacity-90"
    >
      {isGenerating ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Генерация...
        </>
      ) : (
        label
      )}
    </Button>
  );
}
