"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { DollarSign, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

interface StartExecutionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStart: (config: { autoApprove: boolean; costLimit?: number; engine: "legacy" | "ahp" }) => void;
}

export default function StartExecutionModal({ open, onOpenChange, onStart }: StartExecutionModalProps) {
  const [mounted, setMounted] = useState(false);
  const [autoApprove, setAutoApprove] = useState(false);
  const [costLimitEnabled, setCostLimitEnabled] = useState(false);
  const [costLimit, setCostLimit] = useState<number>(5);
  const [engine, setEngine] = useState<"legacy" | "ahp">("ahp");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => setMounted(true), []);

  const handleStart = async () => {
    setIsLoading(true);

    try {
      await onStart({
        autoApprove,
        costLimit: costLimitEnabled ? costLimit : undefined,
        engine,
      });

      onOpenChange(false);
      setAutoApprove(false);
      setCostLimitEnabled(false);
      setCostLimit(5);

      toast({
        title: "Execution started",
        description: engine === "ahp" ? "AHP Dispatcher started" : "Auto execution session has been started.",
      });
    } catch (error) {
      toast({
        title: "Failed to start execution",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!open) return null;
  if (!mounted) return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="start-execution-title"
      onClick={(e) => e.target === e.currentTarget && onOpenChange(false)}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-lg shadow-lg max-w-md w-full max-h-[90vh] overflow-y-auto p-6 border border-slate-200 dark:border-slate-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4">
          <h2 id="start-execution-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">Start Auto Execution</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Configure the execution session settings before starting automated task execution.
          </p>
        </div>

        <div className="space-y-4">
          <div className="flex flex-col space-y-2">
            <span className="text-sm text-slate-900 dark:text-slate-100">Execution Engine</span>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input
                  type="radio"
                  name="engine"
                  value="ahp"
                  checked={engine === "ahp"}
                  onChange={() => setEngine("ahp")}
                  className="w-4 h-4"
                />
                <span className="font-medium">🚀 AHP (Agent Hive Protocol)</span>
                <span className="text-xs text-slate-500 dark:text-slate-400 ml-2">Parallel agents via MessageBus</span>
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input
                  type="radio"
                  name="engine"
                  value="legacy"
                  checked={engine === "legacy"}
                  onChange={() => setEngine("legacy")}
                  className="w-4 h-4"
                />
                <span className="font-medium">Legacy</span>
                <span className="text-xs text-slate-500 dark:text-slate-400 ml-2">Single agent, sequential execution</span>
              </label>
            </div>
          </div>

          <div className="flex flex-col space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-900 dark:text-slate-100">Auto-approve all commands</span>
              <input
                type="checkbox"
                checked={autoApprove}
                onChange={(e) => setAutoApprove(e.target.checked)}
                className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              If enabled, all commands will be executed automatically without manual approval.
            </p>
          </div>

          <div className="flex flex-col space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-900 dark:text-slate-100">Enable cost limit</span>
              <input
                type="checkbox"
                checked={costLimitEnabled}
                onChange={(e) => setCostLimitEnabled(e.target.checked)}
                className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
            </div>

            {costLimitEnabled && (
              <div className="flex items-center gap-2 pt-2">
                <div className="relative">
                  <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={costLimit}
                    onChange={(e) => setCostLimit(parseFloat(e.target.value))}
                    className="pl-9 w-20 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm"
                    placeholder="5.00"
                  />
                </div>
                <span className="text-sm text-slate-900 dark:text-slate-100">Cost limit (USD)</span>
              </div>
            )}

            <p className="text-xs text-slate-600 dark:text-slate-400">
              Set a maximum cost limit for the execution session. The session will automatically
              pause if the limit is exceeded. Leave empty for unlimited execution.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleStart} disabled={isLoading}>
            {isLoading ? (
              <>
                <Play className="mr-2 h-4 w-4 animate-pulse" />
                Starting...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Start Execution
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
