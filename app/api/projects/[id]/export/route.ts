import { NextResponse } from "next/server";
import { promises as fs, statSync } from "fs";
import { existsSync } from "fs";
import { join } from "path";
import archiver from "archiver";

import { prisma } from "@/lib/prisma";
import { getProjectDir } from "@/lib/project-workspace";

export const maxDuration = 300;

type ExportType = "full" | "build" | "source";

async function createProjectZip(
  projectDir: string,
  projectId: string,
  exportType: ExportType
): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    const chunks: Buffer[] = [];
    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.on("data", (chunk: Buffer) => chunks.push(chunk));
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", reject);

    try {
      if (exportType === "build") {
        // Export only build artifacts (dist, .next, build, etc.)
        const buildDirs = ["dist", ".next", "build", "out", "public"];
        let hasBuildArtifacts = false;

        for (const buildDir of buildDirs) {
          const buildPath = join(projectDir, buildDir);
          if (existsSync(buildPath)) {
            const stat = statSync(buildPath);
            if (stat.isDirectory()) {
              archive.directory(buildPath, buildDir);
              hasBuildArtifacts = true;
            }
          }
        }

        // Also include package.json for deployment
        const packageJsonPath = join(projectDir, "package.json");
        if (existsSync(packageJsonPath)) {
          archive.file(packageJsonPath, { name: "package.json" });
        }

        // Include README if exists
        const readmePath = join(projectDir, "README.md");
        if (existsSync(readmePath)) {
          archive.file(readmePath, { name: "README.md" });
        }

        if (!hasBuildArtifacts) {
          // Create minimal README if no build artifacts found
          archive.append(
            "# Build Export\n\nNo build artifacts found. Run `npm run build` first.",
            { name: "BUILD_NOTES.txt" }
          );
        }
      } else if (exportType === "source") {
        // Export source files (exclude node_modules, .next, dist, etc.)
        const excludeDirs = [
          "node_modules",
          ".next",
          "dist",
          "build",
          "out",
          ".git",
          ".cursorfiles",
        ];

        const files = await fs.readdir(projectDir, { withFileTypes: true });

        for (const file of files) {
          if (file.isDirectory()) {
            if (!excludeDirs.includes(file.name)) {
              const dirPath = join(projectDir, file.name);
              const stat = await fs.stat(dirPath);
              if (stat.isDirectory()) {
                archive.directory(dirPath, file.name);
              }
            }
          } else {
            // Include files (exclude lockfiles)
            if (
              !file.name.endsWith(".lock") &&
              !file.name.startsWith(".cursorrules")
            ) {
              archive.file(join(projectDir, file.name), { name: file.name });
            }
          }
        }
      } else {
        // Full export: include everything except node_modules
        if (existsSync(projectDir)) {
          const stat = await fs.stat(projectDir);
          if (stat.isDirectory()) {
            archive.directory(projectDir, projectId);
          }
        }
      }

      archive.finalize();
    } catch (error) {
      reject(error);
    }
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;

    // Get export type from query params
    const { searchParams } = new URL(request.url);
    const exportType = (searchParams.get("type") as ExportType) || "full";

    // Validate export type
    if (!["full", "build", "source"].includes(exportType)) {
      return NextResponse.json(
        { error: "Invalid export type. Use: full, build, or source" },
        { status: 400 }
      );
    }

    // Check if project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { plans: { where: { selected: true } } },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Get project directory
    const projectDir = getProjectDir(projectId);

    // Check if project directory exists
    if (!existsSync(projectDir)) {
      return NextResponse.json(
        { error: "Project directory not found. The project may not have been initialized yet." },
        { status: 404 }
      );
    }

    // Generate ZIP archive
    const zipBuffer = await createProjectZip(projectDir, projectId, exportType);

    // Generate filename
    const activePlan = project.plans[0];
    const planName = activePlan
      ? activePlan.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")
      : "project";
    const timestamp = new Date().toISOString().split("T")[0];

    let filename = "";
    switch (exportType) {
      case "build":
        filename = `${planName}-build-${timestamp}.zip`;
        break;
      case "source":
        filename = `${planName}-source-${timestamp}.zip`;
        break;
      case "full":
      default:
        filename = `${planName}-full-${timestamp}.zip`;
    }

    // Return ZIP file
    return new NextResponse(zipBuffer as BodyInit, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": zipBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error("[export] Error:", error);
    const message =
      error instanceof Error ? error.message : error != null ? String(error) : "Failed to export project";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
