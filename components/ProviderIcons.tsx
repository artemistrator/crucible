"use client";

import { cn } from "@/lib/utils";

const iconBase = "size-5 shrink-0";

export function IconOpenAI({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(iconBase, className)}
      aria-label="OpenAI"
    >
      <path
        d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8768-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.8956zm16.5963 3.8558L13.1038 8.364l2.0201-1.1638a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813v6.7329z"
        fill="currentColor"
      />
    </svg>
  );
}

export function IconAnthropic({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(iconBase, className)}
      aria-label="Anthropic"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M14.433 3.156a1.5 1.5 0 0 0-1.366 0L3.906 7.85a1.5 1.5 0 0 0-.656 2.02L7.29 15.5 3.25 19.13a1.5 1.5 0 0 0 .656 2.02l9.161 4.694a1.5 1.5 0 0 0 1.366 0l9.161-4.694a1.5 1.5 0 0 0 .656-2.02L16.71 15.5l3.904-5.63a1.5 1.5 0 0 0-.656-2.02L14.433 3.156zM12 5.618l6.5 3.33-2.5 3.614L12 12.764 8 12.562 5.5 8.948l6.5-3.33zM5.5 10.532l2.202 3.182L5.5 18.382V10.532zm13 0v7.85l-2.202-4.668L18.5 10.532zM12 14.236l2.5 1.802V20.5L12 18.882 9 20.5v-4.462L12 14.236z"
        fill="currentColor"
      />
    </svg>
  );
}

export function IconZai({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(iconBase, className)}
      aria-label="Z.ai GLM"
    >
      <path
        d="M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.18l6.9 3.45L12 11.09 5.1 7.63 12 4.18zM4 8.82l7 3.5v7.36l-7-3.5V8.82zm9 10.86v-7.36l7-3.5v7.36l-7 3.5z"
        fill="currentColor"
      />
    </svg>
  );
}

/** Evolution / ready projects — stylized ascending nodes */
export function IconEvolution({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(iconBase, className)}
      aria-label="Готовые проекты"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2a1 1 0 0 1 .707.293l3 3a1 1 0 0 1-1.414 1.414L12 4.414 9.707 6.707a1 1 0 1 1-1.414-1.414l3-3A1 1 0 0 1 12 2zm0 6a1 1 0 0 1 .707.293l2 2a1 1 0 0 1-1.414 1.414L12 10.414l-1.293 1.293a1 1 0 0 1-1.414-1.414l2-2A1 1 0 0 1 12 8zm-4 4a1 1 0 0 1 1 1v6a1 1 0 1 1-2 0v-6a1 1 0 0 1 1-1zm8 0a1 1 0 0 1 1 1v6a1 1 0 1 1-2 0v-6a1 1 0 0 1 1-1zm-6 4a1 1 0 0 1 1 1v2a1 1 0 1 1-2 0v-2a1 1 0 0 1 1-1zm4 0a1 1 0 0 1 1 1v2a1 1 0 1 1-2 0v-2a1 1 0 0 1 1-1z"
        fill="currentColor"
      />
    </svg>
  );
}

/** Send / submit — arrow up (chat style) */
export function IconSend({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(iconBase, className)}
      aria-hidden
    >
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  );
}
