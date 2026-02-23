import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Немедленный первый ping, чтобы открыть соединение
      controller.enqueue(encoder.encode("data: ping\n\n"));

      const interval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode("data: ping\n\n"));
        } catch {
          clearInterval(interval);
        }
      }, 1000);

      _request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Encoding": "none",
    },
  });
}

