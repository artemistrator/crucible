import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    const where = status ? { status: status as "IN_PROGRESS" | "COMPLETED" | "ARCHIVED" } : {};

    console.log("Fetching projects with where clause:", where);

    const projects = await prisma.project.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { plans: true }
    });
    return NextResponse.json(projects);
  } catch (error) {
    console.error("Failed to fetch projects:", error);
    return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { ideaText, userId } = body ?? {};

    if (!ideaText || typeof ideaText !== "string") {
      return NextResponse.json({ error: "ideaText is required" }, { status: 400 });
    }

    const project = await prisma.project.create({
      data: {
        ideaText,
        userId: typeof userId === "string" ? userId : null
      }
    });

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error("Failed to create project:", error);
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
  }
}
