"use client";

import { useState, useEffect, useRef } from "react";
import { Wifi, WifiOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface SyncStatusProps {
  projectId: string;
  onStatusChange?: (isConnected: boolean) => void;
}

export function SyncStatusIndicator({ projectId, onStatusChange }: SyncStatusProps) {
  console.log("SyncStatusIndicator rendered with projectId:", projectId);
  const [isConnected, setIsConnected] = useState(false);
  const [lastSeen, setLastSeen] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showTooltip, setShowTooltip] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const checkStatus = async () => {
    if (!projectId) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch(`/api/sync/heartbeat?projectId=${projectId}`, {
        signal: controller.signal,
      });
      if (response.ok) {
        const data = await response.json();
        setIsConnected(data.isConnected);
        setLastSeen(data.lastSeen ? new Date(data.lastSeen) : null);
        onStatusChange?.(data.isConnected);
      }
    } catch (error) {
      // Ignore abort errors to avoid noisy console logs when unmounting
      if ((error as any)?.name === "AbortError") {
        return;
      }
      console.warn("Failed to check sync status:", error);
      setIsConnected(false);
      onStatusChange?.(false);
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 5000);
    return () => {
      clearInterval(interval);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [projectId]);

  const formatLastSeen = () => {
    if (!lastSeen) return "Never";
    const seconds = Math.floor((Date.now() - lastSeen.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ago`;
  };

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => setShowTooltip(true), 500);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setShowTooltip(false);
  };

  const getStatusInfo = () => {
    if (isLoading) {
      return {
        icon: <RefreshCw className="h-4 w-4 animate-spin text-slate-400" />,
        label: "Checking...",
        color: "text-slate-400",
        bgColor: "bg-slate-100",
        tooltip: "Checking sync client status...",
      };
    }
    if (isConnected) {
      return {
        icon: <Wifi className="h-4 w-4 text-emerald-500" />,
        label: "Connected",
        color: "text-emerald-600",
        bgColor: "bg-emerald-50",
        tooltip: `Sync client active (last seen: ${formatLastSeen()})`,
      };
    }
    return {
      icon: <WifiOff className="h-4 w-4 text-red-500" />,
      label: "Disconnected",
      color: "text-red-600",
      bgColor: "bg-red-50",
      tooltip: `Sync client not running. Run: node sync-client.js locally. Expected Project ID: ${projectId}`,
    };
  };

  const status = getStatusInfo();

  return (
    <div
      className="relative inline-block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-full transition-colors cursor-pointer",
          status.bgColor
        )}
        onClick={() => {
          if (!isLoading && !isConnected) {
            setShowHelp(true);
          }
        }}
      >
        {status.icon}
        <span className={cn("text-sm font-medium", status.color)}>{status.label}</span>
        {!isLoading && !isConnected && (
          <button
            type="button"
            className="ml-2 text-xs underline text-red-600 hover:text-red-700"
            onClick={(e) => {
              e.stopPropagation();
              setShowHelp(true);
            }}
          >
            How to connect?
          </button>
        )}
      </div>

      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50">
          <div className="px-3 py-2 text-xs text-white bg-slate-900 rounded-md shadow-lg whitespace-nowrap">
            {status.tooltip}
            {lastSeen && (
              <p className="text-slate-400 mt-1">Last seen: {formatLastSeen()}</p>
            )}
          </div>
        </div>
      )}

      <AlertDialog open={showHelp} onOpenChange={setShowHelp}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>How to connect the sync client</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p className="font-medium">1. Download Kit</p>
                <Button size="sm" asChild>
                  <a href={`/api/download-kit?projectId=${encodeURIComponent(projectId)}`}>
                    Download Kit
                  </a>
                </Button>
                <p className="font-medium">2. Extract and run</p>
                <code className="block bg-slate-900 text-slate-100 rounded-md px-3 py-2 text-xs font-mono">
                  node sync-client.js
                </code>
                <p className="text-sm text-slate-500">
                  Keep the terminal window open while using the app. After sync-client connects, heartbeats will appear and the status will show Connected.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface SyncStatusButtonProps {
  projectId: string;
  isDisabled?: boolean;
  onSyncStatusChange?: (isConnected: boolean) => void;
}

export function SyncStatusButton({ projectId, isDisabled = false, onSyncStatusChange }: SyncStatusButtonProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showTooltip, setShowTooltip] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const checkStatus = async () => {
    if (!projectId) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch(`/api/sync/heartbeat?projectId=${projectId}`, {
        signal: controller.signal,
      });
      if (response.ok) {
        const data = await response.json();
        setIsConnected(data.isConnected);
        onSyncStatusChange?.(data.isConnected);
      }
    } catch (error) {
      if ((error as any)?.name === "AbortError") {
        return;
      }
      console.warn("Failed to check sync status (button):", error);
      setIsConnected(false);
      onSyncStatusChange?.(false);
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 5000);
    return () => {
      clearInterval(interval);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [projectId]);

  const shouldDisable = isDisabled || !isConnected || isLoading;

  const handleMouseEnter = () => {
    if (!isConnected && !isLoading) {
      timeoutRef.current = setTimeout(() => setShowTooltip(true), 500);
    }
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setShowTooltip(false);
  };

  return (
    <div
      className="relative inline-block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <Button
        disabled={shouldDisable}
        className={cn(
          "gap-2 bg-emerald-600 hover:bg-emerald-700",
          shouldDisable && "bg-slate-300 cursor-not-allowed hover:bg-slate-300"
        )}
        title={
          !isConnected && !isLoading
            ? "Waiting for sync-client... Check if it's running"
            : undefined
        }
      >
        <Wifi className="h-4 w-4" />
        Start Auto Execution
      </Button>

      {showTooltip && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50">
          <div className="px-3 py-2 text-xs text-white bg-red-900 rounded-md shadow-lg whitespace-nowrap">
            Run: node sync-client.js locally
          </div>
        </div>
      )}
    </div>
  );
}
