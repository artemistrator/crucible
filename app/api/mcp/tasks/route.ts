import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId =
      searchParams.get("projectId") ?? request.headers.get("x-project-id") ?? null;

    if (!projectId || typeof projectId !== "string" || !projectId.trim()) {
      return NextResponse.json(
        { error: "projectId is required. Provide ?projectId=... or X-Project-Id header." },
        { status: 400 }
      );
    }

    const tasks = await prisma.task.findMany({
      where: { plan: { projectId: projectId.trim() } },
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

    return NextResponse.json(tasks);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[mcp/tasks]", error);
    }
    return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
  }
}
