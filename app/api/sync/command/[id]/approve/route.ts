import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CommandStatus } from "@prisma/client";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: commandId } = await params;

    const command = await prisma.syncCommand.findUnique({
      where: { id: commandId },
    });

    if (!command) {
      return NextResponse.json({ error: "Command not found" }, { status: 404 });
    }

    if (command.status !== CommandStatus.PENDING) {
      return NextResponse.json(
        { error: `Command is not in PENDING status (current: ${command.status})` },
        { status: 400 }
      );
    }

    const updatedCommand = await prisma.syncCommand.update({
      where: { id: commandId },
      data: { status: CommandStatus.APPROVED },
    });

    return NextResponse.json({ success: true, command: updatedCommand });
  } catch (error) {
    console.error("[API/sync/command/[id]/approve POST] Error:", error);
    return NextResponse.json(
      { error: "Failed to approve command" },
      { status: 500 }
    );
  }
}
