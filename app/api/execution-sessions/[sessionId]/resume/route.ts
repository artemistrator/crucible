import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;

    console.log(`[Execution Session] Resuming session ${sessionId}`);

    return NextResponse.json({
      sessionId,
      status: "resumed",
    });
  } catch (error) {
    console.error("[API/execution-sessions/[sessionId]/resume POST] Error:", error);
    return NextResponse.json(
      { error: "Failed to resume session" },
      { status: 500 }
    );
  }
}
