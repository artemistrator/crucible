import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      update: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { POST, GET } from "./route";

describe("api/sync/heartbeat", () => {
  const projectId = "heartbeat-test-project";

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("POST updates lastSeen and returns success", async () => {
    vi.mocked(prisma.project.update).mockResolvedValue({
      id: projectId,
      lastSeen: new Date().toISOString(),
    } as any);

    const req = new Request("http://localhost/api/sync/heartbeat", {
      method: "POST",
      body: JSON.stringify({ projectId }),
    });

    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.projectId).toBe(projectId);
    expect(prisma.project.update).toHaveBeenCalled();
  });

  it("GET returns connected when lastSeen is recent", async () => {
    const now = new Date();
    vi.mocked(prisma.project.findUnique).mockResolvedValue({
      lastSeen: now,
    } as any);

    const req = new Request(
      `http://localhost/api/sync/heartbeat?projectId=${projectId}`,
      { method: "GET" }
    );

    const res = await GET(req as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.isConnected).toBe(true);
    expect(json.status).toBe("connected");
  });

  it("GET returns disconnected when lastSeen is too old", async () => {
    const old = new Date(Date.now() - 60_000);
    vi.mocked(prisma.project.findUnique).mockResolvedValue({
      lastSeen: old,
    } as any);

    const req = new Request(
      `http://localhost/api/sync/heartbeat?projectId=${projectId}`,
      { method: "GET" }
    );

    const res = await GET(req as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.isConnected).toBe(false);
    expect(json.status).toBe("disconnected");
  });
});

