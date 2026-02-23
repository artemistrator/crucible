import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { processFile, deleteFileEmbeddings } from "@/lib/rag";
import { parseCode, saveParsedCode, deleteCodeEntities } from "@/lib/rag/parser";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { projectId, filePath, content } = body;

    if (!projectId || !filePath || content === undefined) {
      return NextResponse.json(
        { error: "projectId, filePath and content are required" },
        { status: 400 }
      );
    }

    if (typeof projectId !== "string" || typeof filePath !== "string" || typeof content !== "string") {
      return NextResponse.json(
        { error: "Invalid data types" },
        { status: 400 }
      );
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const existingFile = await prisma.projectFile.findFirst({
      where: {
        projectId,
        name: filePath,
      },
    });

    let fileId: string;

    if (existingFile) {
      fileId = existingFile.id;

      await prisma.projectFile.update({
        where: { id: fileId },
        data: {
          content,
        },
      });

      await deleteFileEmbeddings(fileId);
      await deleteCodeEntities(fileId);
    } else {
      const newFile = await prisma.projectFile.create({
        data: {
          projectId,
          name: filePath,
          content,
          url: `file://${filePath}`,
          mimeType: getMimeType(filePath),
        },
      });

      fileId = newFile.id;
    }

    const cleanContent = content.replace(/\x00/g, '');
    const embeddingIds = await processFile({
      projectId,
      fileId,
      text: cleanContent,
      maxTokens: 1000,
      chunkOverlap: 200,
    });

    const parsedCode = parseCode(content, filePath);
    await saveParsedCode(fileId, parsedCode, projectId);

    return NextResponse.json({
      success: true,
      fileId,
      embeddingsCount: embeddingIds.length,
      isNewFile: !existingFile,
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[API/sync] Error:", error);
    }
    return NextResponse.json(
      { error: "Failed to sync file" },
      { status: 500 }
    );
  }
}

function getMimeType(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";

  const mimeTypes: Record<string, string> = {
    js: "text/javascript",
    ts: "text/typescript",
    tsx: "text/typescript",
    jsx: "text/javascript",
    json: "application/json",
    md: "text/markdown",
    txt: "text/plain",
    html: "text/html",
    css: "text/css",
    scss: "text/x-scss",
    py: "text/x-python",
    go: "text/x-go",
    rs: "text/x-rust",
  };

  return mimeTypes[ext] || "text/plain";
}
