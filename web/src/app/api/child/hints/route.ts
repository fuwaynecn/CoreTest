import { NextResponse } from "next/server";
import { z } from "zod";
import { getDatabase } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { HintAccessError, revealNextHint } from "@/services/training/reveal-hint";

const hintInput = z.strictObject({
  sessionItemId: z.string().min(1),
  requestId: z.uuid(),
});

export async function POST(request: Request) {
  const child = await getCurrentUser();
  if (!child) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if (child.role !== "child") {
    return NextResponse.json({ error: "Child access required" }, { status: 403 });
  }

  const input = hintInput.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json({ error: "Invalid hint input" }, { status: 400 });
  }

  try {
    return NextResponse.json(revealNextHint(
      getDatabase(), child.id, input.data.sessionItemId, input.data.requestId,
    ));
  } catch (error) {
    if (error instanceof HintAccessError) {
      return NextResponse.json({ error: "Training item not found" }, { status: 404 });
    }
    throw error;
  }
}
