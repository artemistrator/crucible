import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

import { prisma } from "@/lib/prisma";
import { processFile } from "@/lib/rag/index";
const pdfParse = require("pdf-parse");

const TEXT_EXTENSIONS = new Set([".txt", ".md", ".json", ".ts", ".js"]);

function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");

    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }

    const files = await prisma.projectFile.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ files });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[upload:get]", error);
    }
    return NextResponse.json({ error: "Failed to load files" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const projectId = formData.get("projectId");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    if (typeof projectId !== "string" || !projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }

    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 413 });
    }

    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await fs.mkdir(uploadDir, { recursive: true });

    const safeName = sanitizeFilename(file.name || "upload");
    const filename = `${Date.now()}-${safeName}`;
    const filePath = path.join(uploadDir, filename);

    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(filePath, buffer);

    const ext = path.extname(safeName).toLowerCase();
    const mimeType = file.type || "application/octet-stream";

    let content: string | null = null;
    if (TEXT_EXTENSIONS.has(ext) || mimeType.startsWith("text/")) {
      content = buffer.toString("utf8");
    } else if (ext === ".pdf" || mimeType === "application/pdf") {
      try {
        const pdfData = await pdfParse(buffer);
        content = pdfData.text || null;
      } catch (err) {
        content = null;
      }
    }

    const created = await prisma.projectFile.create({
      data: {
        projectId,
        name: safeName,
        url: `/uploads/${filename}`,
        mimeType,
        content,
      },
    });

    if (content && content.trim()) {
      try {
        await processFile({
          projectId,
          fileId: created.id,
          text: content
        });
      } catch (err) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[upload:post] embeddings failed", err);
        }
      }
    }

    return NextResponse.json({ file: created });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[upload:post]", error);
    }
    return NextResponse.json({ error: "Failed to upload file" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const fileId = typeof body?.fileId === "string" ? body.fileId : "";

    if (!fileId) {
      return NextResponse.json({ error: "fileId is required" }, { status: 400 });
    }

    const file = await prisma.projectFile.delete({
      where: { id: fileId },
    });

    const filePath = path.join(process.cwd(), "public", file.url.replace(/^\//, ""));
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[upload:delete] file already removed", error);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[upload:delete]", error);
    }
    return NextResponse.json({ error: "Failed to delete file" }, { status: 500 });
  }
}
