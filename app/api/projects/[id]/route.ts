import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

function parseGithubRepo(input: unknown): string | null {
  if (typeof input !== "string" || !input.trim()) return null;
  const s = input.trim();
  // Accept "https://github.com/user/repo" or "user/repo"
  const m = s.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/i);
  if (m) return `${m[1]}/${m[2]}`;
  if (/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/.test(s)) return s;
  return null;
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const project = await prisma.project.findUnique({
      where: { id },
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    await prisma.$transaction(async (tx) => {
      const plans = await tx.plan.findMany({
        where: { projectId: id },
        select: { id: true }
      });
      const planIds = plans.map(p => p.id);

      const files = await tx.projectFile.findMany({
        where: { projectId: id },
        select: { id: true }
      });
      const fileIds = files.map(f => f.id);

      const tasks = await tx.task.findMany({
        where: { planId: { in: planIds } },
        select: { id: true }
      });
      const taskIds = tasks.map(t => t.id);

      const entities = await tx.codeEntity.findMany({
        where: { fileId: { in: fileIds } },
        select: { id: true }
      });
      const entityIds = entities.map(e => e.id);

      await tx.comment.deleteMany({
        where: { taskId: { in: taskIds } }
      });

      await tx.codeDependency.deleteMany({
        where: { OR: [
          { sourceId: { in: entityIds } },
          { targetId: { in: entityIds } }
        ]}
      });

      await tx.codeEntity.deleteMany({
        where: { fileId: { in: fileIds } }
      });

      await tx.fileEmbedding.deleteMany({
        where: { fileId: { in: fileIds } }
      });

      await tx.task.deleteMany({
        where: { planId: { in: planIds } }
      });

      await tx.projectFile.deleteMany({
        where: { projectId: id }
      });

      await tx.syncCommand.deleteMany({
        where: { projectId: id }
      });

      await tx.tokenUsage.deleteMany({
        where: { projectId: id }
      });

      await tx.plan.deleteMany({
        where: { projectId: id }
      });

      await tx.project.delete({
        where: { id }
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[projects:id delete]", error);
    }
    return NextResponse.json(
      { error: "Failed to delete project" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    const context = typeof body?.context === "string" ? body.context : undefined;
    const githubRepo =
      body?.githubRepo === null || body?.githubRepo === ""
        ? null
        : parseGithubRepo(body?.githubRepo) ?? undefined;
    const requireApproval = typeof body?.requireApproval === "boolean" ? body.requireApproval : undefined;

    const data: { context?: string; githubRepo?: string | null; requireApproval?: boolean } = {};
    if (context !== undefined) data.context = context;
    if (githubRepo !== undefined) data.githubRepo = githubRepo;
    if (requireApproval !== undefined) data.requireApproval = requireApproval;

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "At least one of context, githubRepo, or requireApproval is required for PATCH" },
        { status: 400 }
      );
    }

    const project = await prisma.project.update({
      where: { id },
      data,
    });

    return NextResponse.json(project);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[projects:id patch]", error);
    }
    return NextResponse.json(
      { error: "Failed to update project" },
      { status: 500 }
    );
  }
}
