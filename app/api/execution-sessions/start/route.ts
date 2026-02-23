import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ExecutionSessionManager } from "@/lib/execution/session-manager";
import { initProjectWorkspace } from "@/lib/project/init-workspace";
import { ensureSyncClientRunning } from "@/lib/sync/sync-client-runner";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      projectId,
      planId,
      costLimit,
      autoApprove,
      executionMode,
      engine: requestedEngine,
    }: {
      projectId?: string;
      planId?: string;
      costLimit?: number;
      autoApprove?: boolean;
      executionMode?: "local" | "cloud";
      engine?: "legacy" | "ahp";
    } = body;

    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Engine selection: respect explicit request, fallback to legacy
    const engine: "legacy" | "ahp" =
      requestedEngine === "ahp" || requestedEngine === "legacy"
        ? requestedEngine
        : "legacy";
    console.log(`[Execution Session] Selected engine: ${engine}`);

    await prisma.project.update({
      where: { id: projectId },
      data: { status: 'IN_PROGRESS' },
    });

    const sessionManager = ExecutionSessionManager.getInstance();
    const session = await sessionManager.createSession(projectId, planId, costLimit, {
      autoApprove: autoApprove || false,
      executionMode: executionMode === "cloud" ? "cloud" : "local",
      engine, // Store selected engine
    });

    // Start timer for metrics
    await sessionManager.startTimer(session.id);

    // Prepare on-disk workspace and start sync client (dev/cloud mode only)
    try {
      await initProjectWorkspace(projectId);
      ensureSyncClientRunning(
        projectId,
        executionMode === "cloud" ? "cloud" : "local"
      );
    } catch (e) {
      console.error(
        "[Execution Session] Failed to initialize workspace or start sync-client:",
        e
      );
    }

    console.log(`[Execution Session] Started session ${session.id} for project ${projectId}, engine: ${engine}, cost limit: $${costLimit ?? 'unlimited'}`);

    // Fire-and-forget: запускаем воркер в фоне, НЕ ЖДЕМ ответа
    const baseUrl = process.env.INTERNAL_APP_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
    const workerPath = engine === "ahp" ? "/api/execution-sessions/run-ahp" : "/api/execution-sessions/run";

    fetch(`${baseUrl}${workerPath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: session.id }),
    }).catch((e) => console.error("[Start API] Failed to trigger worker:", e));

    return NextResponse.json({
      sessionId: session.id,
      projectId,
      status: session.status,
      costLimit: session.costLimit,
      currentCost: session.currentCost,
      engine,
    });
  } catch (error) {
    console.error("[API/execution-sessions/start POST] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start execution session" },
      { status: 500 }
    );
  }
}
