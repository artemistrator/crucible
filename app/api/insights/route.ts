import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("query") || "";
    const tag = searchParams.get("tag");

    const insights = await prisma.globalInsight.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    let filteredInsights = insights;

    if (query) {
      const lowerQuery = query.toLowerCase();
      filteredInsights = filteredInsights.filter(
        (insight) =>
          insight.content.toLowerCase().includes(lowerQuery) ||
          insight.tags.some((t) => t.toLowerCase().includes(lowerQuery))
      );
    }

    if (tag) {
      filteredInsights = filteredInsights.filter((insight) =>
        insight.tags.includes(tag)
      );
    }

    return NextResponse.json({ insights: filteredInsights });
  } catch (error) {
    console.error("[insights get]", error);
    return NextResponse.json(
      { error: "Failed to fetch insights" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Insight ID is required" },
        { status: 400 }
      );
    }

    await prisma.globalInsight.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[insights delete]", error);
    return NextResponse.json(
      { error: "Failed to delete insight" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, content, tags } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Insight ID is required" },
        { status: 400 }
      );
    }

    const updateData: { content?: string; tags?: string[] } = {};
    if (content !== undefined) updateData.content = content;
    if (tags !== undefined) updateData.tags = tags;

    const insight = await prisma.globalInsight.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ insight });
  } catch (error) {
    console.error("[insights patch]", error);
    return NextResponse.json(
      { error: "Failed to update insight" },
      { status: 500 }
    );
  }
}
