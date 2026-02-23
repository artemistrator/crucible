#!/usr/bin/env node

/**
 * Debug script: snapshot of DB state for key tables.
 *
 * Tables:
 *   - Project (last 5)
 *   - ExecutionSession (last 5, including project id + ideaText)
 *   - SyncCommand (last 5)
 *
 * Uses Prisma directly, same pattern as scripts/get-or-create-project.js.
 */

/* eslint-disable no-console */

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function printSection(title, data) {
  console.log(`\n=== ${title} ===`);
  if (!data || data.length === 0) {
    console.log("(no records)");
    return;
  }
  console.log(JSON.stringify(data, null, 2));
}

async function main() {
  try {
    const projects = await prisma.project.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        ideaText: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const executionSessions = await prisma.executionSession.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        status: true,
        costLimit: true,
        currentCost: true,
        createdAt: true,
        updatedAt: true,
        project: {
          select: {
            id: true,
            ideaText: true,
          },
        },
      },
    });

    const syncCommands = await prisma.syncCommand.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        projectId: true,
        command: true,
        status: true,
        type: true,
        filePath: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await printSection("Projects (last 5)", projects);
    await printSection("ExecutionSessions (last 5)", executionSessions);
    await printSection("SyncCommands (last 5)", syncCommands);
  } catch (err) {
    console.error(
      "[check-db-state] ERROR while querying DB:",
      err instanceof Error ? err.stack || err.message : err,
    );
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

