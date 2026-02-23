import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get("taskId");

    if (taskId) {
      const result = await prisma.tokenUsage.aggregate({
        where: {
          taskId,
        },
        _sum: {
          cost: true,
          promptTokens: true,
          completionTokens: true,
        },
        _count: {
          id: true,
        },
      });

      return NextResponse.json({
        totalCost: result._sum.cost ?? 0,
        totalTokens: (result._sum.promptTokens ?? 0) + (result._sum.completionTokens ?? 0),
        promptTokens: result._sum.promptTokens ?? 0,
        completionTokens: result._sum.completionTokens ?? 0,
        totalCalls: result._count.id ?? 0,
      });
    }

    const breakdown = searchParams.get("breakdown") === "true";

    if (breakdown) {
      const [byModelRaw, byActionRaw] = await Promise.all([
        prisma.tokenUsage.groupBy({
          by: ["model"],
          _sum: { cost: true },
          _count: { id: true },
        }),
        prisma.tokenUsage.groupBy({
          by: ["actionType"],
          _sum: { cost: true },
          _count: { id: true },
        }),
      ]);

      const byModel = byModelRaw.map((r) => ({
        model: r.model,
        cost: r._sum.cost ?? 0,
        calls: r._count.id ?? 0,
      }));

      const byActionType = byActionRaw.map((r) => ({
        actionType: r.actionType,
        cost: r._sum.cost ?? 0,
        calls: r._count.id ?? 0,
      }));

      const totalCost = byModel.reduce((s, m) => s + m.cost, 0);
      const totalCalls = byModel.reduce((s, m) => s + m.calls, 0);

      return NextResponse.json({
        totalCost,
        totalCalls,
        byModel,
        byActionType,
      });
    }

    const result = await prisma.tokenUsage.aggregate({
      _sum: {
        cost: true,
        promptTokens: true,
        completionTokens: true,
      },
      _count: {
        id: true,
      },
    });

    return NextResponse.json({
      totalCost: result._sum.cost ?? 0,
      totalTokens: (result._sum.promptTokens ?? 0) + (result._sum.completionTokens ?? 0),
      promptTokens: result._sum.promptTokens ?? 0,
      completionTokens: result._sum.completionTokens ?? 0,
      totalCalls: result._count.id ?? 0,
    });
  } catch (error) {
    console.error("[billing]", error);
    return NextResponse.json(
      { error: "Failed to fetch billing data" },
      { status: 500 }
    );
  }
}
