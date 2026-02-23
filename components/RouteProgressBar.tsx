"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import NProgress from "nprogress";

import "nprogress/nprogress.css";

NProgress.configure({ showSpinner: false, trickleSpeed: 150, minimum: 0.15 });

export function RouteProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Каждое изменение URL считаем окончанием навигации
    NProgress.done();
  }, [pathname, searchParams]);

  useEffect(() => {
    const handleStart = () => {
      NProgress.start();
    };

    // Патчим push/replace в браузере, чтобы ловить переходы из useRouter и Link
    const origPushState = window.history.pushState;
    const origReplaceState = window.history.replaceState;

    window.history.pushState = function (...args) {
      handleStart();
      return origPushState.apply(this, args as any);
    };
    window.history.replaceState = function (...args) {
      handleStart();
      return origReplaceState.apply(this, args as any);
    };

    return () => {
      window.history.pushState = origPushState;
      window.history.replaceState = origReplaceState;
    };
  }, []);

  return null;
}

