import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getQALogsForTask, getRecentQALogs } from "@/lib/qa-logger";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const { searchParams } = request.nextUrl;
  const recent = searchParams.get('recent') === 'true';

  try {
    if (recent) {
      const logs = getRecentQALogs(100);
      return NextResponse.json({ logs });
    }

    const logs = getQALogsForTask(taskId);
    return NextResponse.json({ taskId, logs });
  } catch (error) {
    console.error('[API/qa-logs] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch QA logs' }, { status: 500 });
  }
}
