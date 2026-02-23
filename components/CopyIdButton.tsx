"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";

interface CopyIdButtonProps {
  id: string;
  label?: string;
  className?: string;
}

export function CopyIdButton({ id, label, className }: CopyIdButtonProps) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      toast({
        title: "Copied!",
        description: `${label || "ID"} copied to clipboard`,
      });
      setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.error("[copy:id]", error);
      toast({
        variant: "destructive",
        title: "Failed to copy",
        description: "Please try again",
      });
    }
  }

  return (
    <button
      onClick={handleCopy}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-mono text-slate-600 transition hover:border-slate-300 hover:bg-slate-50",
        className
      )}
    >
      <span className="max-w-[100px] truncate">{id}</span>
      {copied ? (
        <Check className="h-3 w-3 text-emerald-600" />
      ) : (
        <Copy className="h-3 w-3 text-slate-400 hover:text-slate-600" />
      )}
    </button>
  );
}
