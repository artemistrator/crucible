import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CommandStatus } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");

    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required" },
        { status: 400 }
      );
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const approvedCommand = await prisma.syncCommand.findFirst({
      where: {
        projectId,
        status: "APPROVED",
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    if (!approvedCommand) {
      return NextResponse.json({ command: null });
    }

    await prisma.syncCommand.update({
      where: { id: approvedCommand.id },
      data: { status: "EXECUTING" },
    });

    return NextResponse.json({
      command: {
        id: approvedCommand.id,
        command: approvedCommand.command,
        reason: approvedCommand.reason,
        type: approvedCommand.type,
        filePath: approvedCommand.filePath,
        fileContent: approvedCommand.fileContent,
      },
    });
  } catch (error) {
    console.error("[API/sync/command GET] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch command" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, command, reason, commandId, stdout, stderr, exitCode, type, filePath, fileContent } = body;

    if (commandId) {
      if (!commandId) {
        return NextResponse.json(
          { error: "commandId is required for result submission" },
          { status: 400 }
        );
      }

      const existingCommand = await prisma.syncCommand.findUnique({
        where: { id: commandId },
      });

      if (!existingCommand) {
        return NextResponse.json({ error: "Command not found" }, { status: 404 });
      }

      const status = exitCode === 0 ? "COMPLETED" : "FAILED";

      await prisma.syncCommand.update({
        where: { id: commandId },
        data: {
          status,
          stdout,
          stderr,
          exitCode,
        },
      });

      return NextResponse.json({ success: true, status });
    }

    if (!projectId || !command) {
      return NextResponse.json(
        { error: "projectId and command are required" },
        { status: 400 }
      );
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const newCommand = await prisma.syncCommand.create({
      data: {
        projectId,
        command,
        reason,
        type,
        filePath,
        fileContent,
      },
    });

    return NextResponse.json({
      success: true,
      commandId: newCommand.id,
    });
  } catch (error) {
    console.error("[API/sync/command POST] Error:", error);
    return NextResponse.json(
      { error: "Failed to create command" },
      { status: 500 }
    );
  }
}
