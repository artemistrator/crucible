import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ planId: string }> }
) {
  try {
    const { planId } = await params;
    const body = await _request.json().catch(() => ({}));
    const { selected } = body ?? {};

    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    if (selected === true) {
      await prisma.$transaction([
        prisma.plan.updateMany({
          where: { projectId: plan.projectId },
          data: { selected: false },
        }),
        prisma.plan.update({
          where: { id: planId },
          data: { selected: true },
        }),
      ]);
    } else if (typeof selected === "boolean") {
      await prisma.plan.update({
        where: { id: planId },
        data: { selected },
      });
    }

    const updated = await prisma.plan.findUnique({
      where: { id: planId },
      include: { tasks: true },
    });
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update plan" },
      { status: 500 }
    );
  }
}
