import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

/**
 * GET full plan data for embedding PlanPageClient (tasks with dependencies, etc.)
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ planId: string }> }
) {
  try {
    const { planId } = await params;
    const plan = await prisma.plan.findUnique({
      where: { id: planId },
      include: {
        tasks: {
          include: {
            dependencies: {
              include: {
                dependsOn: {
                  select: { id: true, title: true, status: true },
                },
              },
            },
          },
        },
        project: true,
      },
    });

    if (!plan || !plan.project) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    const tasks = [...plan.tasks]
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((task) => ({
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        executorAgent: task.executorAgent,
        observerAgent: task.observerAgent,
        generatedPrompt: task.generatedPrompt,
        branchName: task.branchName,
        dependencies: (task.dependencies ?? []).map((d) => ({
          id: d.dependsOn.id,
          title: d.dependsOn.title,
          status: d.dependsOn.status,
        })),
      }));

    return NextResponse.json({
      plan: {
        id: plan.id,
        title: plan.title,
        projectId: plan.projectId,
        aiProvider: plan.project.aiProvider ?? null,
        aiModel: plan.project.aiModel ?? null,
      },
      tasks,
    });
  } catch (error) {
    console.error("[plans/full] GET error:", error);
    return NextResponse.json(
      { error: "Failed to load plan" },
      { status: 500 }
    );
  }
}
