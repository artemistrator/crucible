import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import type { Dirent } from "fs";
import { join } from "path";
import { getProjectDir } from "@/lib/project-workspace";

type FileNode = {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
};

const DEFAULT_MAX_DEPTH = 3;

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "logs",
  "coverage",
]);

async function readDirectoryTree(
  rootFsPath: string,
  relativePath: string,
  maxDepth: number,
  currentDepth: number = 0
): Promise<FileNode[]> {
  if (currentDepth > maxDepth) {
    return [];
  }

  const fullPath = relativePath
    ? join(rootFsPath, relativePath)
    : rootFsPath;

  let dirEntries: Dirent[];
  try {
    dirEntries = await fs.readdir(fullPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const entries = dirEntries
    .filter((e) => !IGNORED_DIRS.has(e.name))
    .filter((e) => !e.isSymbolicLink());

  const nodePromises = entries.map(async (entry) => {
    const name = entry.name;
    const entryRelativePath = relativePath ? join(relativePath, name) : name;

    if (entry.isDirectory()) {
      const children =
        currentDepth < maxDepth
          ? await readDirectoryTree(
              rootFsPath,
              entryRelativePath,
              maxDepth,
              currentDepth + 1
            )
          : [];

      return {
        name,
        path: entryRelativePath,
        type: "directory" as const,
        children,
      };
    }
    return {
      name,
      path: entryRelativePath,
      type: "file" as const,
    };
  });

  const nodes = await Promise.all(nodePromises);

  // Sort directories first, then files, alphabetically
  nodes.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "directory" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  return nodes;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const maxDepthParam = searchParams.get("maxDepth");

    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required" },
        { status: 400 }
      );
    }

    const maxDepth =
      typeof maxDepthParam === "string"
        ? Number.parseInt(maxDepthParam, 10) || DEFAULT_MAX_DEPTH
        : DEFAULT_MAX_DEPTH;

    const rootFsPath = getProjectDir(projectId);

    try {
      const stat = await fs.lstat(rootFsPath);
      if (!stat.isDirectory()) {
        return NextResponse.json(
          { error: "Project directory is not a folder" },
          { status: 400 }
        );
      }
    } catch {
      const root: FileNode = {
        name: projectId,
        path: "",
        type: "directory",
        children: [],
      };
      return NextResponse.json({ root });
    }

    const children = await readDirectoryTree(rootFsPath, "", maxDepth);

    const root: FileNode = {
      name: projectId,
      path: "",
      type: "directory",
      children,
    };

    return NextResponse.json({ root });
  } catch (error) {
    console.error("[API/files GET] Error:", error);
    return NextResponse.json(
      { error: "Failed to read project files" },
      { status: 500 }
    );
  }
}

