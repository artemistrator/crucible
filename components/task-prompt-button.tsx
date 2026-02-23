"use client";

import { Button } from "@/components/ui/button";

export function TaskPromptButton({ taskId }: { taskId: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        console.log("generate prompt", { taskId });
      }}
    >
      Сгенерировать промпт
    </Button>
  );
}
