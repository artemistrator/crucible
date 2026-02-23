import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const message = typeof body?.message === "string" ? body.message : "";

    if (!message) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    const reply = message.trim().toLowerCase() === "ping" ? "pong" : "unknown";
    return NextResponse.json({ reply });
  } catch (error) {
    return NextResponse.json({ error: "Failed to respond" }, { status: 500 });
  }
}
