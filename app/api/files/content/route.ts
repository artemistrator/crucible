import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import { join } from "path";
import { getProjectDir } from "@/lib/project-workspace";

const MAX_FILE_SIZE = 512 * 1024; // 512KB

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const pathParam = searchParams.get("path");

    if (!projectId || !pathParam) {
      return NextResponse.json(
        { error: "projectId and path are required" },
        { status: 400 }
      );
    }

    const rootFsPath = getProjectDir(projectId);
    const safePath = pathParam.replace(/\.\./g, "").replace(/^\/+/, "");
    const fullPath = join(rootFsPath, safePath);

    if (!fullPath.startsWith(rootFsPath)) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }

    const stat = await fs.stat(fullPath);
    if (!stat.isFile()) {
      return NextResponse.json(
        { error: "Path is not a file" },
        { status: 400 }
      );
    }

    if (stat.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large (max ${MAX_FILE_SIZE / 1024}KB)` },
        { status: 400 }
      );
    }

    const content = await fs.readFile(fullPath, "utf-8");

    return NextResponse.json({
      path: safePath,
      content,
      size: stat.size,
    });
  } catch (error) {
    console.error("[API/files/content GET] Error:", error);
    return NextResponse.json(
      { error: "Failed to read file" },
      { status: 500 }
    );
  }
}
