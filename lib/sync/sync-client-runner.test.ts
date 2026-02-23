import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("child_process", () => {
  return {
    spawn: vi.fn(() => {
      return {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        killed: false,
      };
    }),
  };
});

vi.mock("@/lib/project-workspace", () => ({
  getProjectDir: (projectId: string) => `/tmp/projects/${projectId}`,
}));

describe("ensureSyncClientRunning", () => {
  const projectId = "test-project";

  beforeEach(() => {
    vi.resetModules();
    delete process.env.SYNC_CLIENT_AUTOSTART;
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("starts sync-client in cloud mode when autostart is enabled by default (non-production)", async () => {
    const { ensureSyncClientRunning } = await import("./sync-client-runner");
    const { spawn } = await import("child_process");

    ensureSyncClientRunning(projectId, "cloud");

    expect(spawn).toHaveBeenCalledTimes(1);
    const args = (spawn as any).mock.calls[0];
    const argv = args[1] as string[];
    expect(Array.isArray(argv)).toBe(true);
    expect(argv).toContainEqual(expect.stringContaining("sync-client.js"));
    expect(argv).toContain("--url");
    expect(argv).toContain("--project-id");
    expect(argv).toContain(projectId);
  });

  it("does not start sync-client when SYNC_CLIENT_AUTOSTART is explicitly false", async () => {
    process.env.SYNC_CLIENT_AUTOSTART = "false";
    const { ensureSyncClientRunning } = await import("./sync-client-runner");
    const { spawn } = await import("child_process");

    ensureSyncClientRunning(projectId, "cloud");

    expect(spawn).not.toHaveBeenCalled();
  });

  it("is idempotent for the same project while process is alive", async () => {
    const { ensureSyncClientRunning } = await import("./sync-client-runner");
    const { spawn } = await import("child_process");

    ensureSyncClientRunning(projectId, "cloud");
    ensureSyncClientRunning(projectId, "cloud");

    // Second call should not create a new process
    expect(spawn).toHaveBeenCalledTimes(1);
  });
});

