import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface EngineStats {
  totalSessions: number;
  avgDurationSeconds: number;
  avgCost: number;
  successRate: number;
  avgStepsPerSession: number;
  avgErrorsPerSession: number;
}

interface StatsResponse {
  legacy: EngineStats;
  ahp: EngineStats;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Fetch all completed sessions
    const sessions = await prisma.executionSession.findMany({
      where: {
        status: { in: ["STOPPED", "ERROR"] },
      },
      select: {
        id: true,
        engine: true,
        status: true,
        startTime: true,
        endTime: true,
        totalSteps: true,
        totalErrors: true,
        currentCost: true,
        createdAt: true,
      },
    });

    // Separate by engine
    const legacySessions = sessions.filter((s) => s.engine === "legacy");
    const ahpSessions = sessions.filter((s) => s.engine === "ahp");

    const legacyStats = calculateStats(legacySessions);
    const ahpStats = calculateStats(ahpSessions);

    const response: StatsResponse = {
      legacy: legacyStats,
      ahp: ahpStats,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[API/admin/stats] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch stats" },
      { status: 500 }
    );
  }
}

function calculateStats(sessions: any[]): EngineStats {
  const totalSessions = sessions.length;

  if (totalSessions === 0) {
    return {
      totalSessions: 0,
      avgDurationSeconds: 0,
      avgCost: 0,
      successRate: 0,
      avgStepsPerSession: 0,
      avgErrorsPerSession: 0,
    };
  }

  // Calculate duration (for sessions with start and end time)
  const sessionsWithDuration = sessions.filter((s) => s.startTime && s.endTime);
  const totalDuration = sessionsWithDuration.reduce((sum, s) => {
    const start = new Date(s.startTime).getTime();
    const end = new Date(s.endTime).getTime();
    return sum + (end - start);
  }, 0);

  const avgDurationSeconds = sessionsWithDuration.length > 0
    ? totalDuration / sessionsWithDuration.length / 1000
    : 0;

  // Calculate average cost
  const totalCost = sessions.reduce((sum, s) => sum + (s.currentCost || 0), 0);
  const avgCost = totalSessions > 0 ? totalCost / totalSessions : 0;

  // Calculate success rate (sessions that didn't end in ERROR)
  const successCount = sessions.filter((s) => s.status !== "ERROR").length;
  const successRate = totalSessions > 0 ? (successCount / totalSessions) * 100 : 0;

  // Calculate average steps per task
  const totalSteps = sessions.reduce((sum, s) => sum + (s.totalSteps || 0), 0);
  const avgStepsPerSession = totalSessions > 0 ? totalSteps / totalSessions : 0;

  // Calculate average errors per session
  const totalErrors = sessions.reduce((sum, s) => sum + (s.totalErrors || 0), 0);
  const avgErrorsPerSession = totalSessions > 0 ? totalErrors / totalSessions : 0;

  return {
    totalSessions,
    avgDurationSeconds: Math.round(avgDurationSeconds),
    avgCost: Math.round(avgCost * 10000) / 10000,
    successRate: Math.round(successRate),
    avgStepsPerSession: Math.round(avgStepsPerSession),
    avgErrorsPerSession: Math.round(avgErrorsPerSession),
  };
}
