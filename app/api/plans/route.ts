import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const plans = await prisma.plan.findMany({
      orderBy: { createdAt: "desc" },
      include: { tasks: true }
    });
    return NextResponse.json(plans);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch plans" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { projectId, title, description, relevanceScore, selected, techStack } = body ?? {};

    if (!projectId || typeof projectId !== "string") {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }

    if (!title || typeof title !== "string") {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    if (!techStack || typeof techStack !== "string") {
      return NextResponse.json({ error: "techStack is required" }, { status: 400 });
    }

    const plan = await prisma.plan.create({
      data: {
        projectId,
        title,
        description: typeof description === "string" ? description : null,
        techStack,
        relevanceScore: Number.isInteger(relevanceScore) ? relevanceScore : null,
        selected: typeof selected === "boolean" ? selected : false
      }
    });

    return NextResponse.json(plan, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to create plan" }, { status: 500 });
  }
}
