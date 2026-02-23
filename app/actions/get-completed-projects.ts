"use server";

import { prisma } from "@/lib/prisma";

export async function getCompletedProjects() {
  try {
    const projects = await prisma.project.findMany({
      where: { status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        ideaText: true,
        createdAt: true,
      },
    });
    return projects;
  } catch (error) {
    console.error("Failed to fetch completed projects:", error);
    return [];
  }
}
