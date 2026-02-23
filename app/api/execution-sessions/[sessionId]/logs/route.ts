import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;

    const url = new URL(request.url);
    const after = url.searchParams.get("after");

    const where: any = {
      sessionId,
    };

    if (after) {
      const afterDate = new Date(after);
      if (!isNaN(afterDate.getTime())) {
        where.createdAt = { gt: afterDate };
      }
    }

    const logs = await prisma.executionLog.findMany({
      where,
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(
      logs.map((log) => ({
        id: log.id,
        sessionId: log.sessionId,
        type: log.type,
        message: log.message,
        metadata: log.metadata,
        createdAt: log.createdAt.toISOString(),
      }))
    );
  } catch (error) {
    console.error("[API/execution-sessions/[sessionId]/logs GET] Error:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch execution logs";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

