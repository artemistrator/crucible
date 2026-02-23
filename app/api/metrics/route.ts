import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const [
      totalProjects,
      allTasks,
      allInsights,
      totalCostResult,
      activeProjects,
      completedTasks,
    ] = await Promise.all([
      prisma.project.count(),

      prisma.task.findMany({
        select: { status: true },
      }),

      prisma.globalInsight.findMany({
        select: { tags: true },
      }),

      prisma.tokenUsage.aggregate({
        _sum: {
          cost: true,
          promptTokens: true,
          completionTokens: true,
        },
        _count: true,
      }),

      prisma.project.count({
        where: {
          updatedAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),

      prisma.task.count({
        where: { status: "DONE" },
      }),
    ]);

    const taskStats = allTasks.reduce(
      (acc, task) => {
        acc[task.status] = (acc[task.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const allTags = allInsights.flatMap((insight) => insight.tags);
    const tagCounts = allTags.reduce(
      (acc, tag) => {
        acc[tag] = (acc[tag] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const popularTechnologies = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    const metrics = {
      projects: {
        total: totalProjects,
        activeLast7Days: activeProjects,
      },
      tasks: {
        total: allTasks.length,
        completed: completedTasks,
        byStatus: taskStats,
      },
      insights: {
        total: allInsights.length,
        popularTechnologies,
      },
      costs: {
        totalCost: totalCostResult._sum.cost || 0,
        totalPromptTokens: totalCostResult._sum.promptTokens || 0,
        totalCompletionTokens: totalCostResult._sum.completionTokens || 0,
        totalCalls: totalCostResult._count,
      },
    };

    return NextResponse.json(metrics);
  } catch (error) {
    console.error("[metrics get]", error);
    return NextResponse.json(
      { error: "Failed to fetch metrics" },
      { status: 500 }
    );
  }
}
