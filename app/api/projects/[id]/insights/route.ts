import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const { searchParams } = new URL(request.url);
    const planId = searchParams.get("planId") || undefined;
    const sessionId = searchParams.get("sessionId") || undefined;
    const limitParam = searchParams.get("limit");
    const limit = Math.min(Math.max(parseInt(limitParam || "20", 10) || 20, 1), 100);

    const where: any = {
      projectId,
    };

    if (planId) {
      where.planId = planId;
    }
    if (sessionId) {
      where.sessionId = sessionId;
    }

    const insights = await prisma.globalInsight.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    const result = insights.map((insight) => ({
      id: insight.id,
      title: insight.title ?? null,
      summary: insight.content,
      category: insight.category ?? null,
      severity: insight.severity ?? null,
      tags: insight.tags,
      createdAt: insight.createdAt,
      planId: insight.planId ?? null,
      sessionId: insight.sessionId ?? null,
      recommendation: insight.recommendation ?? null,
    }));

    return NextResponse.json({ insights: result });
  } catch (error) {
    console.error("[project insights get]", error);
    return NextResponse.json(
      { error: "Failed to fetch project insights" },
      { status: 500 }
    );
  }
}

