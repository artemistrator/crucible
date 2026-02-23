import { NextResponse } from "next/server";
import { generateTaskPrompt } from "@/lib/agents/prompt-generator";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const taskId = typeof body?.taskId === "string" ? body.taskId : "";
    const forceRegenerate = typeof body?.forceRegenerate === "boolean" ? body.forceRegenerate : false;

    if (!taskId) {
      return NextResponse.json({ error: "taskId is required" }, { status: 400 });
    }

    const prompt = await generateTaskPrompt(taskId, forceRegenerate);

    return NextResponse.json({ success: true, prompt });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[generate-coding-prompt]", error);
    }
    return NextResponse.json(
      { error: "Failed to generate coding prompt" },
      { status: 500 }
    );
  }
}
