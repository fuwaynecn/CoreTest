import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDatabase } from "@/db/client";
import { trainingSessions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const child = await getCurrentUser();
  if (!child) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (child.role !== "child") return NextResponse.json({ error: "Child access required" }, { status: 403 });
  const { id } = await params;
  const status = getDatabase().transaction((tx) => {
    const updated = tx.update(trainingSessions).set({ status: "completed_early", completedAt: Date.now() }).where(and(
      eq(trainingSessions.id, id), eq(trainingSessions.childId, child.id), eq(trainingSessions.status, "in_progress"), inArray(trainingSessions.kind, ["daily", "assessment"]),
    )).run();
    if (updated.changes) return "completed_early";
    const session = tx.select({ status: trainingSessions.status, kind: trainingSessions.kind }).from(trainingSessions).where(and(eq(trainingSessions.id, id), eq(trainingSessions.childId, child.id))).get();
    return session && ["daily", "assessment"].includes(session.kind) ? session.status : null;
  }, { behavior: "immediate" });
  if (!status) return NextResponse.json({ error: "Training session not found" }, { status: 404 });
  return NextResponse.json({ status });
}
