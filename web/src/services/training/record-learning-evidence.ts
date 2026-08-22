import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { masteryEvidence } from "@/db/schema";
import type { MasteryEvidenceInput } from "@/domain/training/mastery";
import { updateLearningState } from "./update-learning-state";

type EvidenceStore = Pick<AppDatabase, "select" | "insert">;
type EvidencePurpose = MasteryEvidenceInput["purpose"];
type ReviewIntervalDays = MasteryEvidenceInput["reviewIntervalDays"];

export type RecordLearningEvidenceCommand = {
  childId: string;
  skillId: string;
  sessionItemId: string;
  templateId: string;
  purpose: EvidencePurpose;
  firstAttemptCorrect: boolean;
  independent: boolean;
  hintLevel: 0 | 1 | 2 | 3 | null;
  dosageTrack: "computation" | "equation" | null;
  difficulty: 1 | 2 | 3 | 4;
  structureTag: string;
  occurredOn: string;
  occurredAt: number;
  diagnosticRunId: string | null;
  diagnosticCompletedOn: string | null;
  diagnosticCompletedAt: number | null;
  reviewIntervalDays?: ReviewIntervalDays;
};

export function recordLearningEvidence(
  db: EvidenceStore,
  command: RecordLearningEvidenceCommand,
) {
  const existing = db.select({ id: masteryEvidence.id }).from(masteryEvidence)
    .where(eq(masteryEvidence.sessionItemId, command.sessionItemId)).get();
  const evidenceId = existing?.id ?? randomUUID();
  if (!existing) {
    db.insert(masteryEvidence).values({
      id: evidenceId,
      ...command,
      reviewIntervalDays: command.reviewIntervalDays ?? 0,
    }).run();
  }
  return { id: evidenceId, ...updateLearningState(db, evidenceId) };
}
