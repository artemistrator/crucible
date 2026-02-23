import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { prisma } from "@/lib/prisma";
import { trackAIUsage } from "@/lib/ai/call";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const taskId = formData.get("taskId") as string;

    if (!file) {
      return NextResponse.json(
        { error: "No file uploaded" },
        { status: 400 }
      );
    }

    if (!taskId) {
      return NextResponse.json(
        { error: "Task ID is required" },
        { status: 400 }
      );
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const uploadsDir = join(process.cwd(), "public", "uploads");
    try {
      await mkdir(uploadsDir, { recursive: true });
    } catch (error) {
      console.error("[upload:mkdir]", error);
    }

    const timestamp = Date.now();
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const fileName = `${timestamp}_${sanitizedFileName}`;
    const filePath = join(uploadsDir, fileName);
    const publicPath = `/uploads/${fileName}`;

    await writeFile(filePath, buffer);

    let visionAnalysis: string | null = null;

    if (file.type.startsWith("image/")) {
      try {
        const base64Image = `data:${file.type};base64,${buffer.toString("base64")}`;

        const visionResponse = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Analyze this UI screenshot. Describe layout, colors, typography, component placement, spacing, and any specific design details for a frontend developer. Be technical and precise. Include specific color codes if visible, mention dimensions/spacing ratios, and describe any interactive elements.",
                },
                {
                  type: "image_url",
                  image_url: {
                    url: base64Image,
                  },
                },
              ],
            },
          ],
          max_tokens: 2000,
        });

        visionAnalysis = visionResponse.choices[0]?.message?.content ?? null;

        if (visionAnalysis) {
          await trackAIUsage(
            {
              usage: visionResponse.usage ? {
                promptTokens: visionResponse.usage.prompt_tokens,
                completionTokens: visionResponse.usage.completion_tokens,
                totalTokens: visionResponse.usage.total_tokens,
              } : undefined,
              model: "gpt-4o",
            },
            {
              projectId: task.planId,
              taskId: task.id,
              actionType: "vision_analysis",
              model: "gpt-4o",
            }
          );
        }
      } catch (visionError) {
        console.error("[upload:vision]", visionError);
      }
    }

    const attachment = await prisma.taskAttachment.create({
      data: {
        taskId,
        filePath: publicPath,
        fileName,
        mimeType: file.type,
        visionAnalysis,
      },
    });

    return NextResponse.json({
      success: true,
      attachment,
    });
  } catch (error) {
    console.error("[upload:error]", error);
    return NextResponse.json(
      { error: "Failed to upload file" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const taskId = searchParams.get("taskId");

  if (!taskId) {
    return NextResponse.json(
      { error: "Task ID is required" },
      { status: 400 }
    );
  }

  try {
    const attachments = await prisma.taskAttachment.findMany({
      where: { taskId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ attachments });
  } catch (error) {
    console.error("[attachments:get]", error);
    return NextResponse.json(
      { error: "Failed to fetch attachments" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { attachmentId, visionAnalysis } = body;

    if (!attachmentId) {
      return NextResponse.json(
        { error: "Attachment ID is required" },
        { status: 400 }
      );
    }

    const attachment = await prisma.taskAttachment.update({
      where: { id: attachmentId },
      data: { visionAnalysis },
    });

    return NextResponse.json({ success: true, attachment });
  } catch (error) {
    console.error("[attachment:update]", error);
    return NextResponse.json(
      { error: "Failed to update attachment" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const attachmentId = searchParams.get("attachmentId");

  if (!attachmentId) {
    return NextResponse.json(
      { error: "Attachment ID is required" },
      { status: 400 }
    );
  }

  try {
    await prisma.taskAttachment.delete({
      where: { id: attachmentId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[attachment:delete]", error);
    return NextResponse.json(
      { error: "Failed to delete attachment" },
      { status: 500 }
    );
  }
}
