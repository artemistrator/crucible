import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { replanTasks } from "@/lib/agents/architect";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    const body = await request.json().catch(() => ({}));
    const { approved } = body;

    if (typeof approved !== "boolean") {
      return NextResponse.json(
        { error: "approved field is required (boolean)" },
        { status: 400 }
      );
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        plan: {
          include: {
            project: { select: { id: true } },
          },
        },
      },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    if (task.status !== "WAITING_APPROVAL") {
      return NextResponse.json(
        { error: "Task is not in WAITING_APPROVAL status" },
        { status: 400 }
      );
    }

    let newStatus = "REVIEW";
    let commentContent = "";

    if (approved) {
      newStatus = "DONE";
      commentContent = "Задача одобрена и переведена в статус DONE.";
    } else {
      newStatus = "REVIEW";
      commentContent = "Задача отклонена. Требуется доработка.";
    }

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: { status: newStatus as any },
    });

    await prisma.comment.create({
      data: {
        taskId,
        content: commentContent,
        authorRole: "TEAMLEAD",
      },
    });

    if (approved && task.plan?.project?.id) {
      try {
        const replanResult = await replanTasks(task.plan.project.id, taskId);
        if (process.env.NODE_ENV !== "production" && replanResult.needsReplan) {
          console.log("[Dynamic Replanning]", replanResult);
        }
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          console.error("[Dynamic Replanning] Error:", error);
        }
      }
    }

    return NextResponse.json({
      success: true,
      task: updated,
      approved,
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[tasks:approve]", error);
    }
    return NextResponse.json(
      { error: "Failed to process approval" },
      { status: 500 }
    );
  }
}
