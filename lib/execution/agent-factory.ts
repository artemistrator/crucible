import { AgentRole, MessageType, MessageStatus } from "@prisma/client";
import { BaseAgent, AgentConfig } from "@/lib/agents/base-agent";
import { TaskExecutorAgent } from "@/lib/agents/task-executor-agent";
import { CSSAgent } from "@/lib/agents/css-agent";
import { QAAgent } from "@/lib/agents/qa-agent";
import { TeamLeadAgent } from "@/lib/agents/team-lead-agent";

export function createAgentForRole(
  agentRole: AgentRole,
  sessionId: string,
  projectId: string,
  autoApprove: boolean,
  onLog: (level: "info" | "error" | "success", message: string) => void,
  mode?: "local" | "cloud"
): BaseAgent {
  const baseConfig: AgentConfig = {
    sessionId,
    projectId,
    agentRole,
    autoApprove,
    onLog,
    mode: mode ?? "local",
  };

  switch (agentRole) {
    case AgentRole.TASK_EXECUTOR:
      return new TaskExecutorAgent(baseConfig);
    case AgentRole.QA:
      return new QAAgent(baseConfig);
    case AgentRole.CSS:
      return new CSSAgent(baseConfig);
    case AgentRole.TEAMLEAD:
      return new TeamLeadAgent(baseConfig);
    case AgentRole.BACKEND:
    case AgentRole.DEVOPS:
    case AgentRole.CURSOR:
      return new TaskExecutorAgent(baseConfig);
    default:
      throw new Error(`Unknown agent role: ${agentRole}`);
  }
}

export function groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
  return array.reduce((result, item) => {
    const groupKey = String(item[key]);
    (result[groupKey] = result[groupKey] || []).push(item);
    return result;
  }, {} as Record<string, T[]>);
}

interface NextItem {
  type: "task" | "ticket";
  data: any;
}

export async function findNextTask(
  projectId: string,
  planId: string | null | undefined
): Promise<NextItem | null> {
  // Тикеты подхватываем даже без planId (сессия может быть запущена только для тикетов).
  const openTicket = await prisma.ticket.findFirst({
    where: {
      projectId,
      status: "OPEN",
      relatedTaskId: { not: null },
    },
    orderBy: { createdAt: "asc" },
  });

  if (openTicket) {
    return { type: "ticket", data: openTicket };
  }

  if (!planId) return null;

  const task = await prisma.task.findFirst({
    where: {
      planId,
      status: "TODO",
    },
    orderBy: { createdAt: "asc" },
  });

  return task ? { type: "task", data: task } : null;
}

export async function isSessionComplete(sessionId: string): Promise<boolean> {
  const session = await prisma.executionSession.findUnique({
    where: { id: sessionId },
    include: {
      project: {
        include: {
          plans: true,
        },
      },
    },
  });

  if (!session) return true;

  const pendingMessages = await prisma.agentMessage.count({
    where: {
      sessionId,
      status: { in: ["PENDING", "PROCESSING"] },
    },
  });

  if (pendingMessages > 0) return false;

  if (session.planId) {
    const todoTasks = await prisma.task.count({
      where: { planId: session.planId, status: "TODO" },
    });
    const openTickets = await prisma.ticket.count({
      where: { projectId: session.projectId, status: "OPEN" },
    });

    return todoTasks === 0 && openTickets === 0;
  }

  // Без плана считаем сессию незавершённой, если есть OPEN-тикеты с привязкой к задаче.
  const openTicketsWithTask = await prisma.ticket.count({
    where: {
      projectId: session.projectId,
      status: "OPEN",
      relatedTaskId: { not: null },
    },
  });

  return openTicketsWithTask === 0;
}

import { prisma } from "@/lib/prisma";
import { messageBus } from "@/lib/execution/message-bus";
