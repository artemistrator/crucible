import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId } = body;

    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }

    // Use a separately typed object to avoid TS complaining about unknown keys
    const updateData: any = { lastSeen: new Date() };

    if (process.env.NODE_ENV !== "production") {
      console.log("[API/sync/heartbeat POST] Incoming heartbeat", {
        projectId,
        ts: new Date().toISOString(),
      });
    }

    const project = await prisma.project.update({
      where: { id: projectId },
      data: updateData,
    }) as any;

    return NextResponse.json({
      success: true,
      projectId: project.id,
      lastSeen: project.lastSeen,
    });
  } catch (error) {
    console.error("[API/sync/heartbeat] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update heartbeat" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");

    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      // Cast select to any to avoid TS complaining if the generated
      // Prisma client types are slightly out of sync with the schema.
      select: { lastSeen: true } as any,
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const now = new Date();
    const lastSeen = project.lastSeen as unknown as Date | null;
    const isConnected = lastSeen && (now.getTime() - lastSeen.getTime()) < 10000;

    if (process.env.NODE_ENV !== "production") {
      const payload = {
        projectId,
        lastSeen: lastSeen?.toISOString() ?? null,
        now: now.toISOString(),
        diffMs: lastSeen ? now.getTime() - lastSeen.getTime() : null,
        isConnected: !!isConnected,
      };
      console.log("[API/sync/heartbeat GET] Status check", payload);
    }

    return NextResponse.json({
      projectId,
      lastSeen: lastSeen?.toISOString(),
      isConnected,
      status: isConnected ? "connected" : "disconnected",
    });
  } catch (error) {
    console.error("[API/sync/heartbeat GET] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to check status" },
      { status: 500 }
    );
  }
}
