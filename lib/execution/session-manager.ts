import { prisma } from "@/lib/prisma";

type SessionStatus = "RUNNING" | "PAUSED" | "STOPPED" | "ERROR";

interface ExecutionSession {
  id: string;
  projectId: string;
  planId?: string;
  status: SessionStatus;
  costLimit?: number | null;
  currentCost: number;
  retryCounter: Map<string, number>;
  lastErrorSignature: string | null;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  totalSteps: number;
  totalErrors: number;
  startTime?: Date | null;
  endTime?: Date | null;
}

class ExecutionSessionManager {
  private static instance: ExecutionSessionManager;
  private activeSessions: Map<string, ExecutionSession>;

  private constructor() {
    this.activeSessions = new Map();
  }

  static getInstance(): ExecutionSessionManager {
    if (!ExecutionSessionManager.instance) {
      ExecutionSessionManager.instance = new ExecutionSessionManager();
    }
    return ExecutionSessionManager.instance;
  }

  async createSession(
    projectId: string,
    planId?: string,
    costLimit?: number,
    metadataOverrides?: Record<string, any>
  ): Promise<ExecutionSession> {
    const dbSession = await prisma.executionSession.create({
      data: {
        projectId,
        planId,
        costLimit: costLimit ?? null,
        currentCost: 0,
        status: "RUNNING",
        metadata: {
          retryCounter: {},
          lastErrorSignature: null,
          ...(metadataOverrides || {}),
        },
      },
    });

    const session: ExecutionSession = {
      id: dbSession.id,
      projectId: dbSession.projectId,
      planId: dbSession.planId ?? undefined,
      status: dbSession.status as SessionStatus,
      costLimit: dbSession.costLimit ?? undefined,
      currentCost: dbSession.currentCost,
      retryCounter: new Map(),
      lastErrorSignature: null,
      metadata: (dbSession.metadata as Record<string, any>) || {},
      createdAt: dbSession.createdAt,
      updatedAt: dbSession.updatedAt,
      totalSteps: (dbSession as any).totalSteps ?? 0,
      totalErrors: (dbSession as any).totalErrors ?? 0,
      startTime: (dbSession as any).startTime ?? null,
      endTime: (dbSession as any).endTime ?? null,
    };

    this.activeSessions.set(session.id, session);

    console.log(`[SessionManager] Created session ${session.id} for project ${projectId}`);

    return session;
  }

  async getSession(sessionId: string): Promise<ExecutionSession | null> {
    let session = this.activeSessions.get(sessionId);

    if (!session) {
      const dbSession = await prisma.executionSession.findUnique({
        where: { id: sessionId },
      });

      if (dbSession) {
        const metadata = (dbSession.metadata as Record<string, any>) || {};
        const metadataRetryCounter = metadata.retryCounter || {};
        const metadataLastErrorSignature = metadata.lastErrorSignature || null;

        session = {
          id: dbSession.id,
          projectId: dbSession.projectId,
          planId: dbSession.planId ?? undefined,
          status: dbSession.status as SessionStatus,
          costLimit: dbSession.costLimit ?? undefined,
          currentCost: dbSession.currentCost,
          retryCounter: new Map(Object.entries(metadataRetryCounter).map(([k, v]) => [k, v as number])),
          lastErrorSignature: metadataLastErrorSignature,
          metadata,
          createdAt: dbSession.createdAt,
          updatedAt: dbSession.updatedAt,
          totalSteps: (dbSession as any).totalSteps ?? 0,
          totalErrors: (dbSession as any).totalErrors ?? 0,
          startTime: (dbSession as any).startTime ?? null,
          endTime: (dbSession as any).endTime ?? null,
        };
        this.activeSessions.set(sessionId, session);
      }
    }

    return session ?? null;
  }

  async updateCost(sessionId: string, additionalCost: number): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      console.error(`[SessionManager] Session ${sessionId} not found`);
      return;
    }

    const newCost = session.currentCost + additionalCost;

    await prisma.executionSession.update({
      where: { id: sessionId },
      data: { currentCost: newCost },
    });

    session.currentCost = newCost;
    session.updatedAt = new Date();
    this.activeSessions.set(sessionId, session);

    console.log(`[SessionManager] Updated cost for session ${sessionId}: $${newCost.toFixed(4)}`);

    this.emitEvent(sessionId, {
      type: "cost_updated",
      data: {
        sessionId,
        currentCost: newCost,
        additionalCost,
      },
      timestamp: new Date().toISOString(),
    });
  }

  async checkCostLimit(sessionId: string): Promise<boolean> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return false;
    }

    if (session.costLimit === null || session.costLimit === undefined) {
      return false;
    }

    const exceeded = session.currentCost >= session.costLimit;

    if (exceeded) {
      console.log(`[SessionManager] Cost limit exceeded for session ${sessionId}: $${session.currentCost.toFixed(4)} > $${session.costLimit.toFixed(2)}`);
      await this.pauseSession(sessionId);

      this.emitEvent(sessionId, {
        type: "error",
        message: `Execution paused: Cost limit of $${session.costLimit.toFixed(2)} exceeded. Current cost: $${session.currentCost.toFixed(4)}.`,
        timestamp: new Date().toISOString(),
      });
    }

    return exceeded;
  }

  async incrementRetryCounter(sessionId: string, errorSignature: string): Promise<number> {
    const session = await this.getSession(sessionId);
    if (!session) {
      console.error(`[SessionManager] Session ${sessionId} not found`);
      return 0;
    }

    const currentRetries = session.retryCounter.get(errorSignature) || 0;
    const newRetries = currentRetries + 1;
    session.retryCounter.set(errorSignature, newRetries);

    await this.persistRetryState(sessionId);

    console.log(`[SessionManager] Incremented retry counter for ${errorSignature}: ${newRetries}`);

    return newRetries;
  }

  async checkRetryLimit(sessionId: string, errorSignature: string): Promise<{ shouldPause: boolean; reason?: string }> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return { shouldPause: false };
    }

    const retries = session.retryCounter.get(errorSignature) || 0;

    if (retries > 3) {
      const reason = `Failed to fix issue after 3 attempts (error signature: ${errorSignature}). Please help.`;
      console.warn(`[SessionManager] Retry limit exceeded for ${errorSignature}: ${retries} attempts`);
      return { shouldPause: true, reason };
    }

    if (errorSignature === session.lastErrorSignature) {
      const reason = `Same error occurred twice in a row (error signature: ${errorSignature}). Possible infinite loop detected. Pausing execution.`;
      console.warn(`[SessionManager] Duplicate error detected: ${errorSignature}`);
      return { shouldPause: true, reason };
    }

    await this.updateErrorTracking(sessionId, errorSignature);

    return { shouldPause: false };
  }

  private async updateErrorTracking(sessionId: string, lastErrorSignature: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return;
    }

    session.lastErrorSignature = lastErrorSignature;

    await prisma.executionSession.update({
      where: { id: sessionId },
      data: {
        metadata: {
          ...session.metadata,
          lastErrorSignature,
          retryCounter: Object.fromEntries(session.retryCounter),
        },
      },
    });

    console.log(`[SessionManager] Updated last error signature for session ${sessionId}: ${lastErrorSignature}`);
  }

  private async persistRetryState(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return;
    }

    await prisma.executionSession.update({
      where: { id: sessionId },
      data: {
        metadata: {
          ...session.metadata,
          retryCounter: Object.fromEntries(session.retryCounter),
          lastErrorSignature: session.lastErrorSignature,
        },
      },
    });

    console.log(`[SessionManager] Retry state persisted for session ${sessionId}`);
  }

  async pauseSession(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      console.error(`[SessionManager] Session ${sessionId} not found`);
      return;
    }

    await prisma.executionSession.update({
      where: { id: sessionId },
      data: { status: "PAUSED" },
    });

    session.status = "PAUSED";
    session.updatedAt = new Date();
    this.activeSessions.set(sessionId, session);

    console.log(`[SessionManager] Paused session ${sessionId}`);

    this.emitEvent(sessionId, {
      type: "session_paused",
      data: { sessionId, status: "PAUSED" },
      timestamp: new Date().toISOString(),
    });
  }

  async resumeSession(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      console.error(`[SessionManager] Session ${sessionId} not found`);
      return;
    }

    await prisma.executionSession.update({
      where: { id: sessionId },
      data: { status: "RUNNING" },
    });

    session.status = "RUNNING";
    session.updatedAt = new Date();
    this.activeSessions.set(sessionId, session);

    console.log(`[SessionManager] Resumed session ${sessionId}`);

    this.emitEvent(sessionId, {
      type: "session_resumed",
      data: { sessionId, status: "RUNNING" },
      timestamp: new Date().toISOString(),
    });
  }

  async stopSession(sessionId: string, reason?: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      console.error(`[SessionManager] Session ${sessionId} not found`);
      return;
    }

    await prisma.executionSession.update({
      where: { id: sessionId },
      data: {
        status: "STOPPED",
        metadata: reason ? { ...session.metadata, stopReason: reason } : session.metadata,
      },
    });

    session.status = "STOPPED";
    session.updatedAt = new Date();
    this.activeSessions.set(sessionId, session);

    console.log(`[SessionManager] Stopped session ${sessionId}: ${reason || "Unknown reason"}`);

    this.emitEvent(sessionId, {
      type: "session_stopped",
      data: { sessionId, status: "STOPPED", reason },
      timestamp: new Date().toISOString(),
    });

    this.activeSessions.delete(sessionId);
  }

  async setSessionError(sessionId: string, error: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      console.error(`[SessionManager] Session ${sessionId} not found`);
      return;
    }

    await prisma.executionSession.update({
      where: { id: sessionId },
      data: {
        status: "ERROR",
        metadata: { ...session.metadata, error },
      },
    });

    session.status = "ERROR";
    session.updatedAt = new Date();
    this.activeSessions.set(sessionId, session);

    console.log(`[SessionManager] Session ${sessionId} error: ${error}`);

    this.emitEvent(sessionId, {
      type: "error",
      message: error,
      data: { sessionId, error },
      timestamp: new Date().toISOString(),
    });
  }

  private async emitEvent(sessionId: string, event: any): Promise<void> {
    try {
      const baseUrl = process.env.INTERNAL_APP_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
      await fetch(`${baseUrl}/api/execution-sessions/${sessionId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
      });
    } catch (error) {
      console.error(`[SessionManager] Failed to emit event:`, error);
    }
  }

  async recordStep(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      console.error(`[SessionManager] Session ${sessionId} not found`);
      return;
    }

    const newTotalSteps = (session.totalSteps || 0) + 1;

    await prisma.executionSession.update({
      where: { id: sessionId },
      data: { totalSteps: newTotalSteps },
    });

    session.totalSteps = newTotalSteps;
    this.activeSessions.set(sessionId, session);

    console.log(`[SessionManager] Recorded step for session ${sessionId}: ${newTotalSteps} total steps`);
  }

  async recordError(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      console.error(`[SessionManager] Session ${sessionId} not found`);
      return;
    }

    const newTotalErrors = (session.totalErrors || 0) + 1;

    await prisma.executionSession.update({
      where: { id: sessionId },
      data: { totalErrors: newTotalErrors },
    });

    session.totalErrors = newTotalErrors;
    this.activeSessions.set(sessionId, session);

    console.log(`[SessionManager] Recorded error for session ${sessionId}: ${newTotalErrors} total errors`);
  }

  async startTimer(sessionId: string): Promise<void> {
    await prisma.executionSession.update({
      where: { id: sessionId },
      data: { startTime: new Date() },
    });

    const session = await this.getSession(sessionId);
    if (session) {
      session.startTime = new Date();
      this.activeSessions.set(sessionId, session);
    }

    console.log(`[SessionManager] Started timer for session ${sessionId}`);
  }

  async stopTimer(sessionId: string): Promise<void> {
    await prisma.executionSession.update({
      where: { id: sessionId },
      data: { endTime: new Date() },
    });

    const session = await this.getSession(sessionId);
    if (session) {
      session.endTime = new Date();
      this.activeSessions.set(sessionId, session);
    }

    console.log(`[SessionManager] Stopped timer for session ${sessionId}`);
  }

  getActiveSessions(): ExecutionSession[] {
    return Array.from(this.activeSessions.values());
  }
}

export { ExecutionSessionManager, type ExecutionSession, type SessionStatus };
