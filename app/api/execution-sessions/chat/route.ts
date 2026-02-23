import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ExecutionAgent } from "@/lib/agents/execution-agent";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, message, projectId } = body;

    if (!sessionId || !message || !projectId) {
      return NextResponse.json(
        { error: "sessionId, message, and projectId are required" },
        { status: 400 }
      );
    }

    const session = await prisma.executionSession.findUnique({
      where: { id: sessionId },
      include: { project: true },
    });

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    console.log(`[Chat] Processing user message for session ${sessionId}: ${message}`);

    try {
      await prisma.executionLog.create({
        data: {
          sessionId,
          type: "user_message",
          message,
          metadata: {
            eventType: "user_message",
            data: { projectId, sessionId },
          },
        },
      });
    } catch (logErr) {
      console.error("[Chat] Failed to persist user_message log:", logErr);
    }

    const sessionMetadata = (session.metadata as Record<string, any>) || {};
    const executionMode: "local" | "cloud" =
      sessionMetadata.executionMode === "cloud" ? "cloud" : "local";

    const agent = new ExecutionAgent({
      projectId: session.projectId,
      planId: session.planId || "",
      sessionId: session.id,
      autoApprove: sessionMetadata.autoApprove || false,
      mode: executionMode,
      onLog: (level, msg) => {
        console.log(`[ExecutionAgent/${sessionId}] [${level}] ${msg}`);
      },
    });

    await agent.handleUserMessage(message);

    return NextResponse.json({
      success: true,
      messageId: `msg-${Date.now()}`,
      sessionId,
    });
  } catch (error) {
    console.error("[API/execution-sessions/chat POST] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process message" },
      { status: 500 }
    );
  }
}
