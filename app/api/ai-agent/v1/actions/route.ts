import { NextResponse } from "next/server";
import { TaskStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const VALID_STATUSES: TaskStatus[] = ["TODO", "IN_PROGRESS", "REVIEW", "DONE"];

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = typeof body?.action === "string" ? body.action : "";

    if (!action) {
      return NextResponse.json(
        { error: "action is required. One of: get_tasks, get_task_details, update_task" },
        { status: 400 }
      );
    }

    switch (action) {
      case "get_tasks": {
        const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
        if (!projectId) {
          return NextResponse.json(
            { error: "get_tasks requires projectId" },
            { status: 400 }
          );
        }
        const tasks = await prisma.task.findMany({
          where: { plan: { projectId } },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            title: true,
            description: true,
            status: true,
            executorAgent: true,
            observerAgent: true,
            generatedPrompt: true,
            planId: true,
            branchName: true,
            createdAt: true,
            updatedAt: true,
          },
        });
        return NextResponse.json({ tasks });
      }

      case "get_task_details": {
        const taskId = typeof body.taskId === "string" ? body.taskId.trim() : "";
        if (!taskId) {
          return NextResponse.json(
            { error: "get_task_details requires taskId" },
            { status: 400 }
          );
        }
        const task = await prisma.task.findUnique({
          where: { id: taskId },
          include: {
            plan: {
              select: {
                id: true,
                title: true,
                projectId: true,
                techStack: true,
              },
            },
          },
        });
        if (!task) {
          return NextResponse.json({ error: "Task not found" }, { status: 404 });
        }
        return NextResponse.json({ task });
      }

      case "update_task": {
        const taskId = typeof body.taskId === "string" ? body.taskId.trim() : "";
        if (!taskId) {
          return NextResponse.json(
            { error: "update_task requires taskId" },
            { status: 400 }
          );
        }
        const status =
          typeof body.status === "string" && VALID_STATUSES.includes(body.status as TaskStatus)
            ? (body.status as TaskStatus)
            : undefined;

        const data: { status?: TaskStatus } = {};
        if (status) data.status = status;

        if (Object.keys(data).length === 0) {
          return NextResponse.json(
            { error: "update_task requires status: TODO | IN_PROGRESS | REVIEW | DONE" },
            { status: 400 }
          );
        }

        const updated = await prisma.task.update({
          where: { id: taskId },
          data,
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
        const transformedTask = {
          ...updated,
          dependencies: updated.dependencies.map((d) => ({
            id: d.dependsOn.id,
            title: d.dependsOn.title,
            status: d.dependsOn.status,
          })),
        };
        return NextResponse.json({ success: true, task: transformedTask });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}. Use: get_tasks, get_task_details, update_task` },
          { status: 400 }
        );
    }
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[ai-agent/actions]", error);
    }
    return NextResponse.json({ error: "Failed to perform action" }, { status: 500 });
  }
}
