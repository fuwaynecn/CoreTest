import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDatabase } from "@/db/client";
import { trainingSessions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const child = await getCurrentUser();
  if (!child) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (child.role !== "child") return NextResponse.json({ error: "Child access required" }, { status: 403 });
  const { id } = await params;
  const db = getDatabase();
  const session = db.select({ status: trainingSessions.status, kind: trainingSessions.kind }).from(trainingSessions).where(and(eq(trainingSessions.id, id), eq(trainingSessions.childId, child.id))).get();
  if (!session || !["daily", "assessment"].includes(session.kind)) return NextResponse.json({ error: "Training session not found" }, { status: 404 });
  if (session.status === "in_progress") db.update(trainingSessions).set({ status: "completed_early", completedAt: Date.now() }).where(eq(trainingSessions.id, id)).run();
  return NextResponse.json({ status: session.status === "completed" ? "completed" : "completed_early" });
}
