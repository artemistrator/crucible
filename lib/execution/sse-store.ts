// In-memory SSE sessions store for execution sessions.
// For production, this should be replaced with a shared pub/sub (e.g. Redis).

export const activeSessions = new Map<string, Set<ReadableStreamDefaultController>>();

export function emitSessionEvent(sessionId: string, event: any) {
  const controllers = activeSessions.get(sessionId);
  if (!controllers) return;

  const encoder = new TextEncoder();
  const data = `data: ${JSON.stringify(event)}\n\n`;

  controllers.forEach((controller) => {
    try {
      controller.enqueue(encoder.encode(data));
    } catch {
      // Controller is dead, remove it from the set
      controllers.delete(controller);
    }
  });
}

