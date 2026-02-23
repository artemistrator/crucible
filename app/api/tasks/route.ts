import { NextResponse } from "next/server";
import { AgentRole, TaskStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const tasks = await prisma.task.findMany({
      orderBy: { createdAt: "desc" }
    });
    return NextResponse.json(tasks);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { planId, title, description, status, executorAgent, observerAgent, generatedPrompt } = body ?? {};

    if (!planId || typeof planId !== "string") {
      return NextResponse.json({ error: "planId is required" }, { status: 400 });
    }

    if (!title || typeof title !== "string") {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    if (!description || typeof description !== "string") {
      return NextResponse.json({ error: "description is required" }, { status: 400 });
    }

    const statusValue =
      typeof status === "string" && Object.values(TaskStatus).includes(status as TaskStatus)
        ? (status as TaskStatus)
        : undefined;

    const executorAgentValue =
      typeof executorAgent === "string" && Object.values(AgentRole).includes(executorAgent as AgentRole)
        ? (executorAgent as AgentRole)
        : undefined;

    const observerAgentValue =
      typeof observerAgent === "string" && Object.values(AgentRole).includes(observerAgent as AgentRole)
        ? (observerAgent as AgentRole)
        : undefined;

    const task = await prisma.task.create({
      data: {
        planId,
        title,
        description,
        status: statusValue,
        executorAgent: executorAgentValue,
        observerAgent: observerAgentValue,
        generatedPrompt: typeof generatedPrompt === "string" ? generatedPrompt : null
      }
    });

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}
