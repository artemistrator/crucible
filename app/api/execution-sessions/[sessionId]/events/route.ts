import { NextRequest, NextResponse } from "next/server";
import { activeSessions, emitSessionEvent } from "@/lib/execution/sse-store";

export const dynamic = "force-dynamic"; // важен для отключения буферизации
export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Всегда регистрируем контроллер для этой сессии
      let controllers = activeSessions.get(sessionId);
      if (!controllers) {
        controllers = new Set();
        activeSessions.set(sessionId, controllers);
      }
      controllers.add(controller);

      // Приветственное сообщение (чтобы открыть соединение) — в формате комментария SSE
      controller.enqueue(
        encoder.encode(`: Connected to session ${sessionId}\n\n`),
      );

      request.signal.addEventListener("abort", () => {
        activeSessions.get(sessionId)?.delete(controller);
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

// POST для обратной совместимости: ExecutionAgent продолжает слать события через fetch
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const event = await request.json();

  emitSessionEvent(sessionId, event);

  return NextResponse.json({ success: true });
}

