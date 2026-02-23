"use client";

import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface EngineStats {
  totalSessions: number;
  avgDurationSeconds: number;
  avgCost: number;
  successRate: number;
  avgStepsPerTask: number;
  avgErrorsPerSession: number;
}

interface StatsResponse {
  legacy: EngineStats;
  ahp: EngineStats;
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch("/api/admin/stats");
        const data = await res.json();
        setStats(data);
      } catch (error) {
        console.error("Failed to fetch stats:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-lg">Loading stats...</div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-lg text-red-500">Failed to load stats</div>
      </div>
    );
  }

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h`;
  };

  const formatPercent = (value: number) => `${value}%`;

  const formatCurrency = (value: number) => `$${(value / 100).toFixed(4)}`;

  const renderStatCard = (title: string, description: string, children: React.ReactNode) => (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );

  const renderEngineStats = (engineName: string, engineStats: EngineStats) => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {renderStatCard("Total Sessions", "Total number of execution sessions", (
          <div className="text-4xl font-bold">{engineStats.totalSessions}</div>
        ))}

        {renderStatCard("Success Rate", "Percentage of successful sessions", (
          <div className="text-4xl font-bold">{formatPercent(engineStats.successRate)}</div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {renderStatCard("Avg. Duration", "Average execution time", (
          <div className="text-3xl font-bold">{formatDuration(engineStats.avgDurationSeconds)}</div>
        ))}

        {renderStatCard("Avg. Cost", "Average cost per session", (
          <div className="text-3xl font-bold">{formatCurrency(engineStats.avgCost)}</div>
        ))}

        {renderStatCard("Avg. Errors", "Average errors per session", (
          <div className="text-3xl font-bold">{engineStats.avgErrorsPerSession}</div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Steps per Session</CardTitle>
          <CardDescription>Average number of steps</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={[
              { name: "Legacy", value: stats.legacy.avgStepsPerTask },
              { name: "AHP", value: stats.ahp.avgStepsPerTask },
            ]}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#8884d8" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-4xl font-bold mb-8">Engine Performance Comparison</h1>
      <p className="text-gray-600 mb-8">
        Comparing Legacy (single agent) vs AHP (Agent Hive Protocol - parallel agents)
      </p>

      <div className="space-y-12">
        {/* Legacy Engine Stats */}
        <div>
          <h2 className="text-3xl font-semibold mb-4 flex items-center gap-3">
            <span>🔧 Legacy Engine</span>
            <span className="text-sm font-normal text-gray-500">Single Agent - Sequential Execution</span>
          </h2>
          {renderEngineStats("Legacy", stats.legacy)}
        </div>

        {/* AHP Engine Stats */}
        <div>
          <h2 className="text-3xl font-semibold mb-4 flex items-center gap-3">
            <span>🚀 AHP Engine</span>
            <span className="text-sm font-normal text-gray-500">Agent Hive Protocol - Parallel Execution</span>
          </h2>
          {renderEngineStats("AHP", stats.ahp)}
        </div>
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Comparison Summary</CardTitle>
          <CardDescription>Key performance metrics comparison</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded">
              <span className="font-semibold">Speed Improvement</span>
              <span className="text-2xl font-bold">
                {stats.legacy.avgDurationSeconds > 0
                  ? ((stats.legacy.avgDurationSeconds - stats.ahp.avgDurationSeconds) / stats.legacy.avgDurationSeconds * 100).toFixed(1)
                  : "0"}
                %
              </span>
            </div>

            <div className="flex items-center justify-between p-4 bg-green-50 rounded">
              <span className="font-semibold">Cost Reduction</span>
              <span className="text-2xl font-bold">
                {stats.legacy.avgCost > 0
                  ? ((stats.legacy.avgCost - stats.ahp.avgCost) / stats.legacy.avgCost * 100).toFixed(1)
                  : "0"}
                %
              </span>
            </div>

            <div className="flex items-center justify-between p-4 bg-blue-50 rounded">
              <span className="font-semibold">Success Rate Difference</span>
              <span className="text-2xl font-bold">
                {((stats.ahp.successRate - stats.legacy.successRate) * 100).toFixed(2)}
                %
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
