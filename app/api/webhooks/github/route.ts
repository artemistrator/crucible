import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";

import { prisma } from "@/lib/prisma";

/** Extracts "owner/repo" from full_name or html_url */
function parseRepoFullName(repo: { full_name?: string; html_url?: string } | undefined): string | null {
  if (!repo) return null;
  const full = repo.full_name ?? "";
  if (full) return full;
  const url = repo.html_url ?? "";
  const m = url.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/i);
  return m ? `${m[1]}/${m[2]}` : null;
}

/** Extracts branch name from ref like "refs/heads/feature/my-branch" */
function refToBranch(ref: string | undefined): string | null {
  if (!ref || typeof ref !== "string") return null;
  const prefix = "refs/heads/";
  return ref.startsWith(prefix) ? ref.slice(prefix.length) : null;
}

/** Verifies GitHub webhook signature */
function verifySignature(payload: string, signature: string | null, secret: string): boolean {
  if (!secret || !signature?.startsWith("sha256=")) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(payload).digest("hex");
  if (expected.length !== signature.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(signature, "utf8"));
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  const secret = process.env.GITHUB_WEBHOOK_SECRET ?? "";
  if (secret && !verifySignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = request.headers.get("x-github-event") ?? "";

  if (event === "push") {
    const ref = payload.ref as string | undefined;
    const repo = payload.repository as { full_name?: string; html_url?: string } | undefined;
    const repoFull = parseRepoFullName(repo);
    const branch = refToBranch(ref);

    if (!repoFull || !branch) {
      return NextResponse.json({ ok: true, message: "No repo/branch" });
    }

    const task = await prisma.task.findFirst({
      where: {
        branchName: branch,
        plan: { project: { githubRepo: repoFull } },
      },
    });

    if (task && task.status !== "IN_PROGRESS") {
      await prisma.task.update({
        where: { id: task.id },
        data: { status: "IN_PROGRESS" },
      });
      return NextResponse.json({ ok: true, updated: task.id, status: "IN_PROGRESS" });
    }
    return NextResponse.json({ ok: true, message: "No matching task or already IN_PROGRESS" });
  }

  if (event === "pull_request") {
    const action = payload.action as string | undefined;
    const pr = payload.pull_request as {
      merged?: boolean;
      head?: { ref?: string };
      base?: { ref?: string };
    } | undefined;
    const repo = payload.repository as { full_name?: string } | undefined;
    const repoFull = parseRepoFullName(repo);
    const branch = pr?.head?.ref ?? null;

    if (!repoFull || !branch) {
      return NextResponse.json({ ok: true, message: "No repo/branch" });
    }

    const task = await prisma.task.findFirst({
      where: {
        branchName: branch,
        plan: { project: { githubRepo: repoFull } },
      },
    });

    if (!task) {
      return NextResponse.json({ ok: true, message: "No matching task" });
    }

    if (action === "opened" || action === "reopened") {
      await prisma.task.update({
        where: { id: task.id },
        data: { status: "REVIEW" },
      });
      return NextResponse.json({ ok: true, updated: task.id, status: "REVIEW" });
    }

    if (action === "closed" && pr?.merged === true) {
      await prisma.task.update({
        where: { id: task.id },
        data: { status: "DONE" },
      });
      return NextResponse.json({ ok: true, updated: task.id, status: "DONE" });
    }

    return NextResponse.json({ ok: true, message: "No status change" });
  }

  return NextResponse.json({ ok: true, message: "Event ignored" });
}
