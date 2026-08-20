import { NextResponse } from "next/server";
import { z } from "zod";
import { getDatabase } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  DiagnosisAccessError,
  DiagnosisStateError,
  getOrCreateDiagnosis,
  InvalidDiagnosisAnswerError,
  submitDiagnosticAttempt,
} from "@/services/diagnosis/diagnosis-service";

const diagnosisAttemptInput = z.strictObject({
  sessionItemId: z.string().uuid(),
  clientSubmissionId: z.string().uuid(),
  answerText: z.string().trim().min(1).max(128),
});

type ChildAuthResult =
  | { ok: false; response: NextResponse }
  | { ok: true; childId: string };

async function requireChild(): Promise<ChildAuthResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, response: NextResponse.json({ error: "Authentication required" }, { status: 401 }) };
  if (user.role !== "child") {
    return { ok: false, response: NextResponse.json({ error: "Child access required" }, { status: 403 }) };
  }
  return { ok: true, childId: user.id };
}

export async function GET() {
  const auth = await requireChild();
  if (!auth.ok) return auth.response;
  return NextResponse.json(getOrCreateDiagnosis(getDatabase(), auth.childId));
}

export async function POST(request: Request) {
  const auth = await requireChild();
  if (!auth.ok) return auth.response;
  const input = diagnosisAttemptInput.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json({ error: "Invalid diagnosis attempt" }, { status: 400 });
  }

  try {
    return NextResponse.json(submitDiagnosticAttempt(getDatabase(), {
      childId: auth.childId,
      ...input.data,
    }));
  } catch (error) {
    if (error instanceof DiagnosisAccessError
      || error instanceof DiagnosisStateError
      || error instanceof InvalidDiagnosisAnswerError) {
      return NextResponse.json({ error: "Invalid diagnosis attempt" }, { status: 400 });
    }
    throw error;
  }
}
