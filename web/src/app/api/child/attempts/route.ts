import { NextResponse } from "next/server";
import { z } from "zod";
import { getDatabase } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  InvalidAnswerError,
  submitAttempt,
  TrainingAccessError,
} from "@/services/training/submit-attempt";

const attemptInput = z.strictObject({
  sessionItemId: z.string().min(1),
  clientSubmissionId: z.string().uuid(),
  answerText: z.string().max(128),
  activeDurationMs: z.number().finite(),
  hintLevel: z.number().finite(),
  hintCount: z.number().finite(),
  readingCardResponse: z.object({
    target: z.string(), givens: z.string(), units: z.string(), usefulFacts: z.string(), relationship: z.string(), estimateRange: z.string(),
  }).optional(),
});

export async function POST(request: Request) {
  const child = await getCurrentUser();

  if (!child) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if (child.role !== "child") {
    return NextResponse.json({ error: "Child access required" }, { status: 403 });
  }

  const input = attemptInput.safeParse(await request.json().catch(() => null));

  if (!input.success) {
    return NextResponse.json({ error: "Invalid attempt input" }, { status: 400 });
  }

  try {
    const result = submitAttempt(getDatabase(), { childId: child.id, ...input.data });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof InvalidAnswerError) {
      return NextResponse.json({ error: "Invalid attempt input" }, { status: 400 });
    }
    if (error instanceof TrainingAccessError) {
      return NextResponse.json({ error: "Training item not found" }, { status: 404 });
    }
    throw error;
  }
}
