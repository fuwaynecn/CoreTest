import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { phase1DailyTemplateIds } from "@/content/phase1-daily";
import type { AppDatabase } from "@/db/client";
import {
  attempts,
  diagnosticRuns,
  questionTemplates,
  sessionItems,
  skills,
  trainingSessions,
} from "@/db/schema";
import type { SessionView } from "@/domain/training/types";
import { dosageTrackForDomain } from "@/domain/dosage/dosage-track";

export class DailyTrainingLockedError extends Error {
  constructor() {
    super("Diagnosis must be completed before daily training");
    this.name = "DailyTrainingLockedError";
  }
}

function parseCommonErrors(value: string | null): unknown[] | null {
  if (value === null) return null;
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error("Question template common errors are invalid");
  return parsed;
}

function parseHintLadder(value: string): string[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.length !== 3
    || !parsed.every((hint) => typeof hint === "string" && hint.trim().length > 0)) {
    throw new Error("Question template hint ladder is invalid");
  }
  return parsed;
}

function parseErrorTargets(value: string): { incompleteReading: Array<"A" | "B" | "C" | "D"> } | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null || !("errorTargets" in parsed)) return undefined;
    const targets = parsed.errorTargets;
    if (typeof targets !== "object" || targets === null
      || Object.keys(targets).some((key) => key !== "incompleteReading")
      || !("incompleteReading" in targets) || !Array.isArray(targets.incompleteReading)
      || targets.incompleteReading.length === 0
      || !targets.incompleteReading.every((target) => ["A", "B", "C", "D"].includes(target))
      || new Set(targets.incompleteReading).size !== targets.incompleteReading.length) return undefined;
    return { incompleteReading: targets.incompleteReading as Array<"A" | "B" | "C" | "D"> };
  } catch {
    return undefined;
  }
}

function loadSessionView(db: AppDatabase, sessionId: string): SessionView {
  return db.transaction((tx) => {
    const session = tx.select({
      id: trainingSessions.id,
      status: trainingSessions.status,
    }).from(trainingSessions).where(eq(trainingSessions.id, sessionId)).get();

    if (!session) throw new Error("Training session was not found");

    const items = tx.select({
      id: sessionItems.id,
      position: sessionItems.position,
      stem: sessionItems.stemSnapshot,
    }).from(sessionItems)
      .where(eq(sessionItems.sessionId, sessionId))
      .orderBy(asc(sessionItems.position))
      .all();

    const questions = items.map((item) => ({
      ...item,
      answered: tx.select({ id: attempts.id })
        .from(attempts)
        .where(and(eq(attempts.sessionItemId, item.id), eq(attempts.isCorrect, true)))
        .limit(1)
        .get() !== undefined,
    }));
    const firstUnanswered = questions.find((question) => !question.answered);

    return {
      id: session.id,
      status: session.status,
      currentPosition: firstUnanswered?.position ?? questions.length,
      questions,
    };
  });
}

export function getOrCreateDailySession(
  db: AppDatabase,
  childId: string,
  date: string,
): SessionView {
  const sessionId = db.transaction((tx) => {
    const existing = tx.select({ id: trainingSessions.id })
      .from(trainingSessions)
      .where(and(
        eq(trainingSessions.childId, childId),
        eq(trainingSessions.sessionDate, date),
        eq(trainingSessions.kind, "daily"),
      ))
      .get();
    if (existing) return existing.id;

    const completedDiagnosis = tx.select({ id: diagnosticRuns.id }).from(diagnosticRuns)
      .where(and(
        eq(diagnosticRuns.childId, childId),
        eq(diagnosticRuns.status, "completed"),
      )).limit(1).get();
    if (!completedDiagnosis) throw new DailyTrainingLockedError();

    const id = randomUUID();
    const availableQuestions = tx.select({
      id: questionTemplates.id,
      stem: questionTemplates.stem,
      answerSpec: questionTemplates.answerSpec,
      explanation: questionTemplates.explanation,
      skillId: questionTemplates.skillId,
      skillName: skills.name,
      difficulty: questionTemplates.difficulty,
      domain: questionTemplates.domain,
      contentTier: questionTemplates.contentTier,
      structureTag: questionTemplates.structureTag,
      estimatedSeconds: questionTemplates.estimatedSeconds,
      readingLoad: questionTemplates.readingLoad,
      answerMode: questionTemplates.answerMode,
      variantSpec: questionTemplates.variantSpec,
      commonErrors: questionTemplates.commonErrors,
      hintLadder: questionTemplates.hintLadder,
      readingCard: questionTemplates.readingCard,
      source: questionTemplates.source,
      licenseStatus: questionTemplates.licenseStatus,
    })
      .from(questionTemplates)
      .innerJoin(skills, eq(questionTemplates.skillId, skills.id))
      .where(and(
        eq(questionTemplates.active, true),
        inArray(questionTemplates.id, phase1DailyTemplateIds),
      ))
      .all();
    const byId = new Map(availableQuestions.map((question) => [question.id, question]));
    const questions = phase1DailyTemplateIds.map((templateId) => byId.get(templateId));
    if (questions.some((question) => question === undefined)) {
      throw new Error("The Phase 1 daily question pool is incomplete");
    }
    const orderedQuestions = questions as Array<NonNullable<(typeof questions)[number]>>;

    tx.insert(trainingSessions).values({
      id,
      childId,
      sessionDate: date,
      kind: "daily",
      ruleVersion: "phase1-v1",
      targetSeconds: orderedQuestions.reduce((total, question) => total + question.estimatedSeconds, 0),
      compositionSnapshot: JSON.stringify({
        snapshotVersion: 1,
        templateIds: phase1DailyTemplateIds,
        reason: "phase1_fixed_daily",
      }),
      status: "in_progress",
      startedAt: Date.now(),
    }).run();
    if (orderedQuestions.length > 0) {
      tx.insert(sessionItems).values(orderedQuestions.map((question, position) => ({
        id: randomUUID(),
        sessionId: id,
        questionTemplateId: question.id,
        position,
        stemSnapshot: question.stem,
        answerSpecSnapshot: question.answerSpec,
        explanationSnapshot: question.explanation,
        skillIdSnapshot: question.skillId,
        skillNameSnapshot: question.skillName,
        difficultySnapshot: question.difficulty,
        contentTierSnapshot: question.contentTier,
        structureTagSnapshot: question.structureTag,
        variantSeed: `phase1-static:${question.id}`,
        selectionReasonSnapshot: JSON.stringify({
          snapshotVersion: 1,
          reason: "phase1_fixed_daily",
          dosageTrack: dosageTrackForDomain(question.domain),
          answerMode: question.answerMode,
          estimatedSeconds: question.estimatedSeconds,
          readingLoad: question.readingLoad,
          commonErrors: parseCommonErrors(question.commonErrors),
          errorTargets: parseErrorTargets(question.variantSpec),
          hintLadder: parseHintLadder(question.hintLadder),
          readingCard: question.readingCard,
          source: question.source,
          licenseStatus: question.licenseStatus,
        }),
      }))).run();
    }

    return id;
  }, { behavior: "immediate" });

  return loadSessionView(db, sessionId);
}
