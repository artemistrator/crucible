"use client";

import Link from "next/link";
import { Moon, Sun, Info, Settings } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { GlobalBillingIndicator } from "@/components/GlobalBillingIndicator";

export function Header() {
  const { theme, setTheme } = useTheme();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-16 items-center justify-between px-6">
        <Link href="/" className="flex items-center space-x-2">
          <span className="text-lg font-semibold tracking-tight text-foreground">
            AI Orchestrator
          </span>
        </Link>

        <div className="flex items-center gap-3">
          <GlobalBillingIndicator />

          <Link href="/settings">
            <Button variant="ghost" size="icon" className="relative" aria-label="Настройки">
              <Settings className="h-[1.2rem] w-[1.2rem] text-slate-600 dark:text-slate-400" />
            </Button>
          </Link>
          <Link href="/help">
            <Button variant="ghost" size="icon" className="relative" aria-label="Справка">
              <Info className="h-[1.2rem] w-[1.2rem] text-slate-600 dark:text-slate-400" />
            </Button>
          </Link>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="relative"
          >
            <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 text-slate-900 transition-all dark:-rotate-90 dark:scale-0 dark:text-slate-100" />
            <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 text-slate-900 transition-all dark:rotate-0 dark:scale-100 dark:text-slate-100" />
            <span className="sr-only">Toggle theme</span>
          </Button>
        </div>
      </div>
    </header>
  );
}

