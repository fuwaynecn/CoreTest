import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { masteryEvidence, masteryStates } from "@/db/schema";
import {
  deriveMasteryState,
  type MasteryEvidenceInput,
} from "@/domain/training/mastery";

type EvidenceStore = Pick<AppDatabase, "select" | "insert"> & Pick<AppDatabase, "update">;
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
  difficulty: 1 | 2 | 3 | 4;
  structureTag: string;
  occurredOn: string;
  occurredAt: number;
  reviewIntervalDays?: ReviewIntervalDays;
};

export function recordLearningEvidence(
  db: EvidenceStore,
  command: RecordLearningEvidenceCommand,
) {
  const current = db.select({ status: masteryStates.status }).from(masteryStates).where(and(
    eq(masteryStates.childId, command.childId),
    eq(masteryStates.skillId, command.skillId),
  )).get();
  const existing = db.select({ id: masteryEvidence.id }).from(masteryEvidence)
    .where(eq(masteryEvidence.sessionItemId, command.sessionItemId)).get();
  if (!existing) {
    db.insert(masteryEvidence).values({
      id: randomUUID(),
      ...command,
      reviewIntervalDays: command.reviewIntervalDays ?? 0,
    }).run();
  }

  const rows = db.select().from(masteryEvidence).where(and(
    eq(masteryEvidence.childId, command.childId),
    eq(masteryEvidence.skillId, command.skillId),
  )).orderBy(
    asc(masteryEvidence.occurredOn),
    asc(masteryEvidence.occurredAt),
    asc(masteryEvidence.id),
  ).all();
  const state = deriveMasteryState(rows.map((row) => ({
    purpose: row.purpose,
    templateId: row.templateId,
    structureTag: row.structureTag,
    difficulty: row.difficulty as 1 | 2 | 3 | 4,
    firstAttemptCorrect: row.firstAttemptCorrect,
    independent: row.independent,
    occurredOn: row.occurredOn,
    reviewIntervalDays: row.reviewIntervalDays as ReviewIntervalDays,
  })), current?.status);
  const cursor = rows.at(-1)?.id ?? null;
  db.insert(masteryStates).values({
    childId: command.childId,
    skillId: command.skillId,
    status: state.status,
    evidenceCount: state.evidenceCount,
    correctCount: state.firstAttemptCorrectCount,
    reasonCode: state.reasonCode,
    evidenceCursor: cursor,
    evidenceVersion: rows.length,
    updatedAt: command.occurredAt,
  }).onConflictDoUpdate({
    target: [masteryStates.childId, masteryStates.skillId],
    set: {
      status: state.status,
      evidenceCount: state.evidenceCount,
      correctCount: state.firstAttemptCorrectCount,
      reasonCode: state.reasonCode,
      evidenceCursor: cursor,
      evidenceVersion: rows.length,
      updatedAt: command.occurredAt,
    },
  }).run();
  return state;
}
