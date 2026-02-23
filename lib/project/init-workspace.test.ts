import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import { join } from "path";
import os from "os";

import { getProjectDir } from "@/lib/project-workspace";
import { initProjectWorkspace } from "./init-workspace";

describe("initProjectWorkspace", () => {
  const projectId = "workspace-test-project";
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await fs.mkdtemp(
      join(os.tmpdir(), "ai-orchestrator-workspace-test-")
    );
    process.env.PROJECTS_ROOT = rootDir;
  });

  it("creates project directory and .orchestrator/config with correct projectId", async () => {
    const projectDir = getProjectDir(projectId);

    await initProjectWorkspace(projectId);

    const stat = await fs.lstat(projectDir);
    expect(stat.isDirectory()).toBe(true);

    const orchestratorDir = join(projectDir, ".orchestrator");
    const configPath = join(orchestratorDir, "config");
    const content = await fs.readFile(configPath, "utf-8");
    expect(content).toContain(`projectId=${projectId}`);
  });
});

