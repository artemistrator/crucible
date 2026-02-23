import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

const ALLOWED_REOPEN = ["REJECTED", "IN_PROGRESS"] as const;

/**
 * PATCH /api/tickets/[ticketId] — обновить тикет (например, открыть снова после отклонения).
 * body: { status: "OPEN" } — разрешено только для тикетов в REJECTED или IN_PROGRESS.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  try {
    const { ticketId } = await params;
    const body = await request.json().catch(() => ({}));
    const status = typeof body?.status === "string" ? body.status : null;

    if (status !== "OPEN") {
      return NextResponse.json(
        { error: "Only status: OPEN is supported (reopen ticket)" },
        { status: 400 }
      );
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    if (!ALLOWED_REOPEN.includes(ticket.status as (typeof ALLOWED_REOPEN)[number])) {
      return NextResponse.json(
        { error: `Cannot reopen ticket in status: ${ticket.status}` },
        { status: 400 }
      );
    }

    const updated = await prisma.ticket.update({
      where: { id: ticketId },
      data: { status: "OPEN" },
    });

    return NextResponse.json({ success: true, ticket: updated });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[tickets:ticketId patch]", error);
    }
    return NextResponse.json(
      { error: "Failed to update ticket" },
      { status: 500 }
    );
  }
}
