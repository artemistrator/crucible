import { prisma } from "@/lib/prisma";

interface ProjectContextOptions {
  includeDetails?: boolean;
  maxTasks?: number;
}

export async function generateProjectContext(
  projectId: string,
  options: ProjectContextOptions = {}
): Promise<string> {
  const { includeDetails = false, maxTasks = 10 } = options;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      plans: {
        where: { selected: true },
        include: {
          tasks: true,
        },
      },
      files: {
        where: {
          name: {
            contains: ".md",
          },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });

  if (!project) {
    throw new Error("Project not found");
  }

  const activePlan = project.plans.find((p) => p.selected);

  const completedTasks = activePlan?.tasks.filter((t) => t.status === "DONE") || [];
  const inProgressTasks = activePlan?.tasks.filter((t) => t.status === "IN_PROGRESS") || [];
  const reviewTasks = activePlan?.tasks.filter((t) => t.status === "REVIEW") || [];
  const blockers = [...inProgressTasks, ...reviewTasks];

  const adrFiles = project.files.filter((f) =>
    f.name.toLowerCase().startsWith("adr") || 
    f.name.toLowerCase().includes("architecture")
  );

  const projectContextLines: string[] = [];
  projectContextLines.push("# Project State");
  projectContextLines.push("");

  projectContextLines.push(`## Project Information`);
  projectContextLines.push(`- Project ID: ${project.id}`);
  projectContextLines.push(`- Idea: ${project.ideaText}`);
  if (project.githubRepo) {
    projectContextLines.push(`- GitHub Repo: ${project.githubRepo}`);
  }
  projectContextLines.push(`- Require Approval: ${project.requireApproval ? "Yes" : "No"}`);
  projectContextLines.push("");

  projectContextLines.push(`## Active Phase`);
  if (activePlan) {
    projectContextLines.push(`- Phase Name: ${activePlan.title}`);
    projectContextLines.push(`- Tech Stack: ${activePlan.techStack}`);
    if (activePlan.description) {
      projectContextLines.push(`- Description: ${activePlan.description}`);
    }
    if (activePlan.estimatedComplexity) {
      projectContextLines.push(`- Complexity: ${activePlan.estimatedComplexity}`);
    }
  } else {
    projectContextLines.push("- No active plan selected");
  }
  projectContextLines.push("");

  projectContextLines.push(`## Completed Tasks (${completedTasks.length})`);
  if (completedTasks.length === 0) {
    projectContextLines.push("- None");
  } else {
    const tasksToShow = completedTasks.slice(0, maxTasks);
    tasksToShow.forEach((task) => {
      projectContextLines.push(`- [DONE] ${task.title}`);
      if (includeDetails && task.description) {
        const shortDesc = task.description.split("\n")[0].substring(0, 100);
        projectContextLines.push(`  ${shortDesc}${task.description.length > 100 ? "..." : ""}`);
      }
    });
    if (completedTasks.length > maxTasks) {
      projectContextLines.push(`- ... and ${completedTasks.length - maxTasks} more`);
    }
  }
  projectContextLines.push("");

  projectContextLines.push(`## Current Blockers (${blockers.length})`);
  if (blockers.length === 0) {
    projectContextLines.push("- None - all clear");
  } else {
    blockers.forEach((task) => {
      const statusEmoji = task.status === "IN_PROGRESS" ? "🔄" : "🔍";
      projectContextLines.push(`- [${statusEmoji} ${task.status}] ${task.title}`);
      if (includeDetails) {
        const shortDesc = task.description.split("\n")[0].substring(0, 80);
        projectContextLines.push(`  ${shortDesc}${task.description.length > 80 ? "..." : ""}`);
      }
    });
  }
  projectContextLines.push("");

  projectContextLines.push(`## Upcoming Tasks`);
  const todoTasks = activePlan?.tasks.filter((t) => t.status === "TODO") || [];
  if (todoTasks.length === 0) {
    projectContextLines.push("- No pending tasks");
  } else {
    const tasksToShow = todoTasks.slice(0, maxTasks);
    tasksToShow.forEach((task) => {
      projectContextLines.push(`- [TODO] ${task.title}`);
      if (task.executorAgent) {
        projectContextLines.push(`  Executor: ${task.executorAgent}`);
      }
    });
    if (todoTasks.length > maxTasks) {
      projectContextLines.push(`- ... and ${todoTasks.length - maxTasks} more`);
    }
  }
  projectContextLines.push("");

  projectContextLines.push(`## Key Architecture Decisions`);
  if (adrFiles.length === 0) {
    projectContextLines.push("- No ADRs recorded yet");
  } else {
    adrFiles.forEach((file) => {
      const fileName = file.name.replace(/\.md$/, "");
      const timestamp = file.createdAt.toISOString().split("T")[0];
      projectContextLines.push(`- [${fileName}] ${timestamp}`);
      if (includeDetails && file.content) {
        const decisionMatch = file.content.match(/## Decision\s*\n([\s\S]+?)(?=\n##|\n###|$)/i);
        if (decisionMatch && decisionMatch[1]) {
          const decision = decisionMatch[1].trim().split("\n")[0].substring(0, 100);
          projectContextLines.push(`  ${decision}${decisionMatch[1].trim().length > 100 ? "..." : ""}`);
        }
      }
    });
  }
  projectContextLines.push("");

  if (project.context) {
    projectContextLines.push(`## Additional Context`);
    projectContextLines.push(project.context);
    projectContextLines.push("");
  }

  return projectContextLines.join("\n");
}

export async function getCompactProjectContext(projectId: string): Promise<string> {
  return generateProjectContext(projectId, {
    includeDetails: false,
    maxTasks: 5,
  });
}

export async function getDetailedProjectContext(projectId: string): Promise<string> {
  return generateProjectContext(projectId, {
    includeDetails: true,
    maxTasks: 20,
  });
}
