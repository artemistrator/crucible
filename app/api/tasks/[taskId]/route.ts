import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { replanTasks } from "@/lib/agents/architect";

const validStatuses = ["TODO", "IN_PROGRESS", "REVIEW", "WAITING_APPROVAL", "DONE"] as const;
const validAgents = ["TASK_EXECUTOR", "BACKEND", "DEVOPS", "TEAMLEAD"] as const;

type TaskStatus = (typeof validStatuses)[number];
type AgentRole = (typeof validAgents)[number];

export async function GET(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        dependencies: {
          include: {
            dependsOn: {
              select: { id: true, title: true, status: true },
            },
          },
        },
      },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      task: {
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        executorAgent: task.executorAgent,
        observerAgent: task.observerAgent,
        generatedPrompt: task.generatedPrompt,
        branchName: task.branchName,
        dependencies: task.dependencies.map((d) => ({
          id: d.dependsOn.id,
          title: d.dependsOn.title,
          status: d.dependsOn.status,
        })),
      },
    });
  } catch (error) {
    console.error("[tasks:get]", error);
    return NextResponse.json({ error: "Failed to fetch task" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    const body = await request.json().catch(() => ({}));
    const status = body?.status;
    const executorAgent = body?.executorAgent;
    const dependencyIds = Array.isArray(body?.dependencyIds)
      ? (body.dependencyIds as string[]).filter((id): id is string => typeof id === "string")
      : undefined;

    const data: { status?: TaskStatus; executorAgent?: AgentRole | null } = {};

    if (typeof status === "string" && validStatuses.includes(status as TaskStatus)) {
      data.status = status as TaskStatus;
    }

    if (executorAgent === null) {
      data.executorAgent = null;
    } else if (
      typeof executorAgent === "string" &&
      validAgents.includes(executorAgent as AgentRole)
    ) {
      data.executorAgent = executorAgent as AgentRole;
    }

    if (dependencyIds !== undefined) {
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: { planId: true },
      });
      if (!task) {
        return NextResponse.json({ error: "Task not found" }, { status: 404 });
      }
      if (dependencyIds.length > 0) {
        const samePlan = await prisma.task.findMany({
          where: { id: { in: dependencyIds }, planId: task.planId },
          select: { id: true },
        });
        const foundIds = new Set(samePlan.map((t) => t.id));
        const invalid = dependencyIds.filter((id) => !foundIds.has(id));
        if (invalid.length > 0) {
          return NextResponse.json(
            { error: "Some dependency IDs are invalid or from another plan" },
            { status: 400 }
          );
        }
      }
    }

    if (Object.keys(data).length === 0 && dependencyIds === undefined) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const updateData: Parameters<typeof prisma.task.update>[0]["data"] = { ...data };

    const updated = await prisma.$transaction(async (tx) => {
      const updatedTask = await tx.task.update({
        where: { id: taskId },
        data: updateData,
      });

      if (dependencyIds !== undefined) {
        await tx.taskDependency.deleteMany({
          where: { taskId },
        });

        if (dependencyIds.length > 0) {
          await tx.taskDependency.createMany({
            data: dependencyIds.map((id) => ({
              taskId,
              dependsOnId: id,
            })),
          });
        }
      }

      return updatedTask;
    });

    const updatedWithDependencies = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        dependencies: {
          include: {
            dependsOn: {
              select: { id: true, title: true, status: true },
            },
          },
        },
        plan: {
          include: {
            project: { select: { id: true } },
          },
        },
      },
    });

    const transformedTask = updatedWithDependencies ? {
      ...updatedWithDependencies,
      dependencies: updatedWithDependencies.dependencies.map((d) => ({
        id: d.dependsOn.id,
        title: d.dependsOn.title,
        status: d.dependsOn.status,
      })),
    } : null;

    if (data.status === "DONE" && updatedWithDependencies?.plan?.project?.id) {
      try {
        const replanResult = await replanTasks(updatedWithDependencies.plan.project.id, taskId);
        if (process.env.NODE_ENV !== "production" && replanResult.needsReplan) {
          console.log("[Dynamic Replanning]", replanResult);
        }
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          console.error("[Dynamic Replanning] Error:", error);
        }
      }
    }

    return NextResponse.json({ success: true, task: transformedTask });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[tasks:patch]", error);
    }
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}
