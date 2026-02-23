import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findUnique: vi.fn(),
    },
    syncCommand: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { GET, POST } from "./route";

describe("api/sync/command", () => {
  const projectId = "sync-command-test-project";

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("POST creates a new command for project", async () => {
    vi.mocked(prisma.project.findUnique).mockResolvedValue({ id: projectId } as any);
    vi.mocked(prisma.syncCommand.create).mockResolvedValue({
      id: "cmd-1",
    } as any);

    const req = new Request("http://localhost/api/sync/command", {
      method: "POST",
      body: JSON.stringify({
        projectId,
        command: "echo debug-sync",
        reason: "test",
      }),
    });

    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.commandId).toBe("cmd-1");
  });

  it("GET returns first APPROVED command and moves it to EXECUTING", async () => {
    vi.mocked(prisma.project.findUnique).mockResolvedValue({ id: projectId } as any);
    vi.mocked(prisma.syncCommand.findFirst).mockResolvedValue({
      id: "cmd-2",
      command: "echo debug-sync",
      reason: "test",
      type: "SHELL",
      filePath: null,
      fileContent: null,
    } as any);

    const req = new Request(
      `http://localhost/api/sync/command?projectId=${projectId}`,
      { method: "GET" }
    );

    const res = await GET(req as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.command).toBeDefined();
    expect(json.command.id).toBe("cmd-2");
    expect(prisma.syncCommand.update).toHaveBeenCalledWith({
      where: { id: "cmd-2" },
      data: { status: "EXECUTING" },
    });
  });
});

