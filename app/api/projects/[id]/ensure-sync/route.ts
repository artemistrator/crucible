import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { initProjectWorkspace } from "@/lib/project/init-workspace";
import { ensureSyncClientRunning } from "@/lib/sync/sync-client-runner";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;

    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required" },
        { status: 400 }
      );
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, lastSeen: true },
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    // Prepare workspace and try to start sync-client (cloud mode)
    await initProjectWorkspace(projectId);
    ensureSyncClientRunning(projectId, "cloud");

    // Compute heartbeat-style status based on lastSeen (same logic as /api/sync/heartbeat)
    const now = new Date();
    const lastSeen = project.lastSeen as unknown as Date | null;
    const isConnected =
      !!lastSeen && now.getTime() - lastSeen.getTime() < 10_000;

    return NextResponse.json({
      projectId,
      lastSeen: lastSeen?.toISOString() ?? null,
      isConnected,
      status: isConnected ? "connected" : "disconnected",
    });
  } catch (error) {
    console.error("[projects:id:ensure-sync POST] Error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to ensure sync client",
      },
      { status: 500 }
    );
  }
}

