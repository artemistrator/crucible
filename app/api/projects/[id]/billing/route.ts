import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const project = await prisma.project.findUnique({
      where: { id },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const tokenUsages = await prisma.tokenUsage.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const totalStats = await prisma.tokenUsage.groupBy({
      by: ["actionType"],
      where: { projectId: id },
      _sum: {
        promptTokens: true,
        completionTokens: true,
        cost: true,
      },
    });

    const totalCost = totalStats.reduce((sum, stat) => sum + (stat._sum.cost ?? 0), 0);
    const totalPromptTokens = totalStats.reduce((sum, stat) => sum + (stat._sum.promptTokens ?? 0), 0);
    const totalCompletionTokens = totalStats.reduce((sum, stat) => sum + (stat._sum.completionTokens ?? 0), 0);

    const byActionType = totalStats.map((stat) => ({
      actionType: stat.actionType,
      promptTokens: stat._sum.promptTokens ?? 0,
      completionTokens: stat._sum.completionTokens ?? 0,
      totalTokens: (stat._sum.promptTokens ?? 0) + (stat._sum.completionTokens ?? 0),
      cost: stat._sum.cost ?? 0,
    }));

    const byModel = await prisma.tokenUsage.groupBy({
      by: ["model"],
      where: { projectId: id },
      _sum: {
        promptTokens: true,
        completionTokens: true,
        cost: true,
      },
    });

    const byModelStats = byModel.map((stat) => ({
      model: stat.model,
      promptTokens: stat._sum.promptTokens ?? 0,
      completionTokens: stat._sum.completionTokens ?? 0,
      totalTokens: (stat._sum.promptTokens ?? 0) + (stat._sum.completionTokens ?? 0),
      cost: stat._sum.cost ?? 0,
    }));

    return NextResponse.json({
      totalCost,
      totalTokens: totalPromptTokens + totalCompletionTokens,
      promptTokens: totalPromptTokens,
      completionTokens: totalCompletionTokens,
      byActionType,
      byModel: byModelStats,
      recentUsages: tokenUsages,
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[billing:get]", error);
    }
    return NextResponse.json({ error: "Failed to fetch billing data" }, { status: 500 });
  }
}
