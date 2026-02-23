import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;

    console.log(`[Execution Session] Pausing session ${sessionId}`);

    return NextResponse.json({
      sessionId,
      status: "paused",
    });
  } catch (error) {
    console.error("[API/execution-sessions/[sessionId]/pause POST] Error:", error);
    return NextResponse.json(
      { error: "Failed to pause session" },
      { status: 500 }
    );
  }
}
