import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;

    console.log(`[Execution Session] Stopping session ${sessionId}`);

    return NextResponse.json({
      sessionId,
      status: "stopped",
    });
  } catch (error) {
    console.error("[API/execution-sessions/[sessionId]/stop POST] Error:", error);
    return NextResponse.json(
      { error: "Failed to stop session" },
      { status: 500 }
    );
  }
}
