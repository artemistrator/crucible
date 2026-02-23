#!/usr/bin/env node

/**
 * Helper script to get or create a Project
 *
 * Usage:
 *   node scripts/get-or-create-project.js
 */

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  try {
    let project = await prisma.project.findFirst({
      select: { id: true, ideaText: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    if (!project) {
      project = await prisma.project.create({
        data: {
          ideaText: "Debug probe project",
          context: "",
          requireApproval: false,
          aiProvider: null,
          aiModel: "gpt-4o-mini",
        },
        select: { id: true, ideaText: true, createdAt: true },
      });
      // eslint-disable-next-line no-console
      console.log("Created new Project:");
    } else {
      // eslint-disable-next-line no-console
      console.log("Found existing Project:");
    }

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          id: project.id,
          ideaText: project.ideaText,
          createdAt: project.createdAt,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(
      "Error in get-or-create-project:",
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

