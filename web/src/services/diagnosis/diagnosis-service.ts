import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq } from "drizzle-orm";
import { phase2Catalog } from "@/content/phase2-catalog";
import type { AppDatabase } from "@/db/client";
import {
  attempts,
  diagnosticParts,
  diagnosticRuns,
  hintEvents,
  questionTemplates,
  sessionItems,
  skills,
  trainingSessions,
} from "@/db/schema";
import { deriveInitialReport } from "@/domain/diagnosis/derive-initial-report";
import { selectNextDiagnosticQuestion } from "@/domain/diagnosis/select-next-question";
import type {
  DiagnosticAnswer,
  DiagnosticPartNumber,
  DiagnosticTemplateSummary,
  Difficulty,
} from "@/domain/diagnosis/types";
import { answerSpecSchema } from "@/domain/questions/answer-spec";
import { extractChoiceOptions, type ChoiceOption } from "@/domain/questions/choice-options";
import {
  instantiateTemplate,
  type QuestionInstance,
} from "@/domain/questions/instantiate-template";
import type { ReviewedTemplate } from "@/domain/questions/template-schema";
import { scoreAnswer } from "@/domain/questions/score-answer";
import { shanghaiDateKey } from "@/domain/time/shanghai-calendar";
import { recordSystemErrorObservation } from "@/services/training/error-observation-service";
import { recordLearningEvidence } from "@/services/training/record-learning-evidence";

type AppTransaction = Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];

const TOTAL_SLOTS = 45 as const;
const SLOTS_PER_PART = 15;
export type DiagnosisRuntime = {
  catalog?: readonly ReviewedTemplate[];
  instantiate?: (template: ReviewedTemplate, seed: string) => QuestionInstance;
};

function resolveRuntime(runtime: DiagnosisRuntime = {}) {
  return {
    catalog: runtime.catalog ?? phase2Catalog,
    instantiate: runtime.instantiate ?? instantiateTemplate,
  };
}

type ItemMetadata = {
  answerMode: string;
  domain: DiagnosticAnswer["domain"];
  choiceOptions?: ChoiceOption[];
};

export type DiagnosisView = {
  runId: string;
  version: number;
  status: "in_progress" | "completed";
  currentPart: 1 | 2 | 3;
  completedSlots: number;
  totalSlots: 45;
  currentItem: null | {
    id: string;
    position: number;
    stem: string;
    answerMode: string;
    answerKind: "number" | "choice";
    requiresUnit: boolean;
    choiceOptions: ChoiceOption[];
  };
};

export type SubmitDiagnosticAttemptCommand = {
  childId: string;
  sessionItemId: string;
  clientSubmissionId: string;
  answerText: string;
};

export type DiagnosticAttemptResult = {
  correct: boolean;
  normalizedAnswer: string;
  explanation: string;
  diagnosis: DiagnosisView;
};

export type DiagnosisLearningGate = {
  formalDailyUnlocked: boolean;
  activeDiagnosis: DiagnosisView | null;
};

export class DiagnosisAccessError extends Error {
  constructor() {
    super("Diagnosis item is not available");
    this.name = "DiagnosisAccessError";
  }
}

export class DiagnosisStateError extends Error {
  constructor(message = "Diagnosis state transition is not allowed") {
    super(message);
    this.name = "DiagnosisStateError";
  }
}

export class DiagnosisRetestConflictError extends DiagnosisStateError {
  constructor(
    public readonly code: "version_conflict" | "retest_already_active",
    public readonly currentVersion: number,
  ) {
    super(code === "version_conflict"
      ? "The completed diagnosis version changed"
      : "A diagnosis retest is already active");
    this.name = "DiagnosisRetestConflictError";
  }
}

export class InvalidDiagnosisAnswerError extends Error {
  constructor(message = "Answer must be at most 128 characters") {
    super(message);
    this.name = "InvalidDiagnosisAnswerError";
  }
}

function parseItemMetadata(raw: string): ItemMetadata {
  const value = JSON.parse(raw) as Partial<ItemMetadata>;
  if (typeof value.answerMode !== "string" || typeof value.domain !== "string") {
    throw new Error("Diagnostic item metadata snapshot is invalid");
  }
  return value as ItemMetadata;
}

function itemDelivery(stem: string, rawAnswerSpec: string, rawMetadata: string) {
  const metadata = parseItemMetadata(rawMetadata);
  const answerSpec = answerSpecSchema.parse(JSON.parse(rawAnswerSpec));
  const choiceOptions = answerSpec.kind === "choice"
    ? metadata.choiceOptions ?? extractChoiceOptions(stem)
    : [];
  if (answerSpec.kind === "choice" && choiceOptions.length !== 4) {
    throw new Error("Diagnostic choice snapshot is invalid");
  }
  return {
    answerMode: metadata.answerMode,
    answerKind: answerSpec.kind,
    requiresUnit: answerSpec.kind === "number" && answerSpec.unit !== null,
    choiceOptions,
  };
}

function latestRun(tx: AppTransaction, childId: string) {
  return tx.select().from(diagnosticRuns)
    .where(eq(diagnosticRuns.childId, childId))
    .orderBy(desc(diagnosticRuns.version)).limit(1).get();
}

function completedSlotCount(tx: AppTransaction, runId: string): number {
  return tx.select({ value: count() }).from(attempts)
    .innerJoin(sessionItems, eq(attempts.sessionItemId, sessionItems.id))
    .innerJoin(trainingSessions, eq(sessionItems.sessionId, trainingSessions.id))
    .where(eq(trainingSessions.diagnosticRunId, runId)).get()?.value ?? 0;
}

function answerHistory(tx: AppTransaction, runId: string): DiagnosticAnswer[] {
  return tx.select({
    templateId: sessionItems.questionTemplateId,
    skillId: sessionItems.skillIdSnapshot,
    difficulty: sessionItems.difficultySnapshot,
    metadata: sessionItems.selectionReasonSnapshot,
    correct: attempts.isCorrect,
  }).from(attempts)
    .innerJoin(sessionItems, eq(attempts.sessionItemId, sessionItems.id))
    .innerJoin(trainingSessions, eq(sessionItems.sessionId, trainingSessions.id))
    .where(eq(trainingSessions.diagnosticRunId, runId))
    .orderBy(asc(trainingSessions.diagnosticPartNumber), asc(sessionItems.position))
    .all()
    .map((row) => ({
      templateId: row.templateId,
      skillId: row.skillId,
      domain: parseItemMetadata(row.metadata).domain,
      difficulty: row.difficulty as Difficulty,
      correct: row.correct,
      independent: true,
    }));
}

function importDiagnosticEvidence(tx: AppTransaction, runId: string, childId: string) {
  const rows = tx.select({
    sessionItemId: sessionItems.id,
    templateId: sessionItems.questionTemplateId,
    skillId: sessionItems.skillIdSnapshot,
    difficulty: sessionItems.difficultySnapshot,
    structureTag: sessionItems.structureTagSnapshot,
    correct: attempts.isCorrect,
    occurredAt: attempts.submittedAt,
  }).from(attempts)
    .innerJoin(sessionItems, eq(attempts.sessionItemId, sessionItems.id))
    .innerJoin(trainingSessions, eq(sessionItems.sessionId, trainingSessions.id))
    .where(eq(trainingSessions.diagnosticRunId, runId))
    .orderBy(asc(attempts.submittedAt), asc(attempts.id))
    .all();
  for (const row of rows) {
    const usedHint = tx.select({ id: hintEvents.id }).from(hintEvents)
      .where(eq(hintEvents.sessionItemId, row.sessionItemId)).limit(1).get() !== undefined;
    recordLearningEvidence(tx, {
      childId,
      skillId: row.skillId,
      sessionItemId: row.sessionItemId,
      templateId: row.templateId,
      purpose: "diagnostic",
      firstAttemptCorrect: row.correct,
      independent: !usedHint,
      difficulty: row.difficulty as 1 | 2 | 3 | 4,
      structureTag: row.structureTag,
      occurredOn: shanghaiDateKey(row.occurredAt),
      occurredAt: row.occurredAt,
      reviewIntervalDays: 0,
    });
  }
}

function viewForRun(tx: AppTransaction, childId: string, runId: string): DiagnosisView {
  const run = tx.select().from(diagnosticRuns).where(and(
    eq(diagnosticRuns.id, runId),
    eq(diagnosticRuns.childId, childId),
  )).get();
  if (!run) throw new DiagnosisAccessError();

  const current = run.status === "in_progress"
    ? tx.select({
      id: sessionItems.id,
      position: sessionItems.position,
      stem: sessionItems.stemSnapshot,
      answerSpec: sessionItems.answerSpecSnapshot,
      metadata: sessionItems.selectionReasonSnapshot,
    }).from(sessionItems)
      .innerJoin(trainingSessions, eq(sessionItems.sessionId, trainingSessions.id))
      .where(and(
        eq(trainingSessions.diagnosticRunId, run.id),
        eq(trainingSessions.diagnosticPartNumber, run.currentPart),
        eq(trainingSessions.status, "in_progress"),
      ))
      .orderBy(desc(sessionItems.position))
      .limit(1).get()
    : undefined;

  return {
    runId: run.id,
    version: run.version,
    status: run.status === "completed" ? "completed" : "in_progress",
    currentPart: run.currentPart as DiagnosticPartNumber,
    completedSlots: completedSlotCount(tx, run.id),
    totalSlots: TOTAL_SLOTS,
    currentItem: current ? {
      id: current.id,
      position: current.position,
      stem: current.stem,
      ...itemDelivery(current.stem, current.answerSpec, current.metadata),
    } : null,
  };
}

function replayView(
  tx: AppTransaction,
  replay: {
    runId: string;
    version: number;
    partNumber: number;
    position: number;
  },
): DiagnosisView {
  const completed = replay.partNumber === 3 && replay.position === SLOTS_PER_PART;
  const nextPart = replay.position === SLOTS_PER_PART && replay.partNumber < 3
    ? replay.partNumber + 1
    : replay.partNumber;
  const next = completed ? undefined : tx.select({
    id: sessionItems.id,
    position: sessionItems.position,
    stem: sessionItems.stemSnapshot,
    answerSpec: sessionItems.answerSpecSnapshot,
    metadata: sessionItems.selectionReasonSnapshot,
  }).from(sessionItems)
    .innerJoin(trainingSessions, eq(sessionItems.sessionId, trainingSessions.id))
    .where(and(
      eq(trainingSessions.diagnosticRunId, replay.runId),
      eq(trainingSessions.diagnosticPartNumber, nextPart),
      eq(sessionItems.position, replay.position === SLOTS_PER_PART ? 1 : replay.position + 1),
    )).get();
  if (!completed && !next) throw new Error("Persisted diagnosis replay snapshot is incomplete");

  return {
    runId: replay.runId,
    version: replay.version,
    status: completed ? "completed" : "in_progress",
    currentPart: nextPart as DiagnosticPartNumber,
    completedSlots: (replay.partNumber - 1) * SLOTS_PER_PART + replay.position,
    totalSlots: TOTAL_SLOTS,
    currentItem: next ? {
      id: next.id,
      position: next.position,
      stem: next.stem,
      ...itemDelivery(next.stem, next.answerSpec, next.metadata),
    } : null,
  };
}

function ensurePartSession(
  tx: AppTransaction,
  run: { id: string; childId: string; seed: string },
  partNumber: DiagnosticPartNumber,
  now: number,
) {
  const existing = tx.select({ id: trainingSessions.id }).from(trainingSessions).where(and(
    eq(trainingSessions.diagnosticRunId, run.id),
    eq(trainingSessions.diagnosticPartNumber, partNumber),
  )).get();
  if (existing) return existing.id;

  const sessionId = randomUUID();
  tx.insert(trainingSessions).values({
    id: sessionId,
    childId: run.childId,
    sessionDate: shanghaiDateKey(now),
    kind: "diagnostic",
    ruleVersion: "phase2a-v1",
    targetSeconds: 25 * 60,
    compositionSnapshot: JSON.stringify({ runId: run.id, partNumber, slots: SLOTS_PER_PART }),
    diagnosticRunId: run.id,
    diagnosticPartNumber: partNumber,
    status: "in_progress",
    startedAt: now,
  }).run();
  return sessionId;
}

function createNextItem(
  tx: AppTransaction,
  run: { id: string; childId: string; seed: string },
  partNumber: DiagnosticPartNumber,
  now: number,
  runtimeInput: DiagnosisRuntime = {},
) {
  const runtime = resolveRuntime(runtimeInput);
  const sessionId = ensurePartSession(tx, run, partNumber, now);
  const completedInPart = tx.select({ value: count() }).from(attempts)
    .innerJoin(sessionItems, eq(attempts.sessionItemId, sessionItems.id))
    .where(eq(sessionItems.sessionId, sessionId)).get()?.value ?? 0;
  const activeRows = tx.select({ id: questionTemplates.id, skillName: skills.name })
    .from(questionTemplates)
    .innerJoin(skills, eq(questionTemplates.skillId, skills.id))
    .where(eq(questionTemplates.active, true)).all();
  const activeById = new Map(activeRows.map((row) => [row.id, row]));
  const catalogById = new Map(runtime.catalog.map((template) => [template.id, template]));
  const skipped = new Set<string>();
  const answers = answerHistory(tx, run.id);
  let selected: {
    selection: NonNullable<ReturnType<typeof selectNextDiagnosticQuestion>>;
    template: ReviewedTemplate;
    instance: QuestionInstance;
    skillName: string;
    choiceOptions: ChoiceOption[];
  } | null = null;

  while (!selected) {
    const eligibleCatalog: DiagnosticTemplateSummary[] = runtime.catalog
      .filter((template) => activeById.has(template.id) && !skipped.has(template.id))
      .map((template) => ({
        templateId: template.id,
        skillId: `skill-${template.skillCode}`,
        domain: template.domain,
        difficulty: template.difficulty,
      }));
    const selection = selectNextDiagnosticQuestion({
      catalog: eligibleCatalog,
      answers,
      runSeed: run.seed,
      partNumber,
      completedInPart,
    });
    if (!selection) throw new DiagnosisStateError("No reviewed diagnosis item is available");

    const template = catalogById.get(selection.templateId);
    const persisted = activeById.get(selection.templateId);
    if (!template || !persisted) {
      skipped.add(selection.templateId);
      continue;
    }
    try {
      const instance = runtime.instantiate(template, selection.variantSeed);
      const choiceOptions = instance.answerSpec.kind === "choice"
        ? extractChoiceOptions(instance.stem)
        : [];
      if (instance.answerSpec.kind === "choice" && choiceOptions.length !== 4) {
        throw new Error("Invalid choice delivery data");
      }
      selected = {
        selection,
        template,
        instance,
        skillName: persisted.skillName,
        choiceOptions,
      };
    } catch {
      skipped.add(selection.templateId);
    }
  }

  const { selection, template, instance, skillName, choiceOptions } = selected;
  tx.insert(sessionItems).values({
    id: randomUUID(),
    sessionId,
    questionTemplateId: template.id,
    position: completedInPart + 1,
    stemSnapshot: instance.stem,
    answerSpecSnapshot: JSON.stringify(instance.answerSpec),
    explanationSnapshot: instance.explanation,
    skillIdSnapshot: `skill-${template.skillCode}`,
    skillNameSnapshot: skillName,
    difficultySnapshot: selection.difficulty,
    contentTierSnapshot: template.contentTier,
    structureTagSnapshot: template.structureTag,
    variantSeed: selection.variantSeed,
    selectionReasonSnapshot: JSON.stringify({
      snapshotVersion: 1,
      reason: selection.reason,
      targetDifficulty: selection.targetDifficulty,
      selectedDifficulty: selection.difficulty,
      domain: template.domain,
      answerMode: template.answerMode,
      choiceOptions,
      hintLadder: instance.hintLadder,
      readingCard: instance.readingCard,
      estimatedSeconds: instance.estimatedSeconds,
      readingLoad: instance.readingLoad,
      commonErrors: instance.commonErrors,
      errorTargets: instance.errorTargets,
      source: instance.source,
      licenseStatus: instance.licenseStatus,
    }),
  }).run();
}

function createRun(
  tx: AppTransaction,
  childId: string,
  version: number,
  now: number,
  runtime: DiagnosisRuntime = {},
): string {
  const runId = randomUUID();
  const seed = `${runId}:version-${version}`;
  tx.insert(diagnosticRuns).values({
    id: runId,
    childId,
    version,
    status: "in_progress",
    currentPart: 1,
    seed,
    startedAt: now,
  }).run();
  tx.insert(diagnosticParts).values([
    { runId, partNumber: 1, status: "in_progress", startedAt: now },
    { runId, partNumber: 2, status: "locked" },
    { runId, partNumber: 3, status: "locked" },
  ]).run();
  createNextItem(tx, { id: runId, childId, seed }, 1, now, runtime);
  return runId;
}

export function getOrCreateDiagnosis(
  db: AppDatabase,
  childId: string,
  now = Date.now(),
  runtime: DiagnosisRuntime = {},
): DiagnosisView {
  return db.transaction((tx) => {
    const existing = latestRun(tx, childId);
    const runId = existing?.id ?? createRun(tx, childId, 1, now, runtime);
    return viewForRun(tx, childId, runId);
  }, { behavior: "immediate" });
}

export function getDiagnosisLearningGate(db: AppDatabase, childId: string): DiagnosisLearningGate {
  return db.transaction((tx) => {
    const current = latestRun(tx, childId);
    const completed = tx.select({ id: diagnosticRuns.id }).from(diagnosticRuns).where(and(
      eq(diagnosticRuns.childId, childId),
      eq(diagnosticRuns.status, "completed"),
    )).limit(1).get();
    return {
      formalDailyUnlocked: completed !== undefined,
      activeDiagnosis: current?.status === "in_progress"
        ? viewForRun(tx, childId, current.id)
        : null,
    };
  });
}

export function getDiagnosisView(db: AppDatabase, childId: string): DiagnosisView {
  return db.transaction((tx) => {
    const run = latestRun(tx, childId);
    if (!run) throw new DiagnosisStateError("Diagnosis has not started");
    return viewForRun(tx, childId, run.id);
  });
}

export function submitDiagnosticAttempt(
  db: AppDatabase,
  command: SubmitDiagnosticAttemptCommand,
  now = Date.now(),
  runtime: DiagnosisRuntime = {},
): DiagnosticAttemptResult {
  if (command.answerText.trim().length === 0) throw new InvalidDiagnosisAnswerError("Answer is required");
  if (command.answerText.length > 128) throw new InvalidDiagnosisAnswerError();

  return db.transaction((tx) => {
    const replay = tx.select({
      childId: trainingSessions.childId,
      sessionKind: trainingSessions.kind,
      runId: trainingSessions.diagnosticRunId,
      version: diagnosticRuns.version,
      partNumber: trainingSessions.diagnosticPartNumber,
      position: sessionItems.position,
      itemId: attempts.sessionItemId,
      correct: attempts.isCorrect,
      normalizedAnswer: attempts.normalizedAnswer,
      explanation: attempts.explanation,
    }).from(attempts)
      .innerJoin(sessionItems, eq(attempts.sessionItemId, sessionItems.id))
      .innerJoin(trainingSessions, eq(sessionItems.sessionId, trainingSessions.id))
      .leftJoin(diagnosticRuns, eq(trainingSessions.diagnosticRunId, diagnosticRuns.id))
      .where(eq(attempts.clientSubmissionId, command.clientSubmissionId)).get();
    if (replay) {
      if (replay.childId !== command.childId
        || replay.itemId !== command.sessionItemId
        || replay.sessionKind !== "diagnostic"
        || replay.runId === null
        || replay.partNumber === null
        || replay.version === null) throw new DiagnosisAccessError();
      return {
        correct: replay.correct,
        normalizedAnswer: replay.normalizedAnswer,
        explanation: replay.explanation,
        diagnosis: replayView(tx, {
          runId: replay.runId,
          version: replay.version,
          partNumber: replay.partNumber,
          position: replay.position,
        }),
      };
    }

    const item = tx.select({
      sessionId: trainingSessions.id,
      runId: diagnosticRuns.id,
      runSeed: diagnosticRuns.seed,
      partNumber: trainingSessions.diagnosticPartNumber,
      childId: trainingSessions.childId,
      stem: sessionItems.stemSnapshot,
      structureTag: sessionItems.structureTagSnapshot,
      answerSpec: sessionItems.answerSpecSnapshot,
      explanation: sessionItems.explanationSnapshot,
      metadata: sessionItems.selectionReasonSnapshot,
    }).from(sessionItems)
      .innerJoin(trainingSessions, eq(sessionItems.sessionId, trainingSessions.id))
      .innerJoin(diagnosticRuns, eq(trainingSessions.diagnosticRunId, diagnosticRuns.id))
      .where(and(
        eq(sessionItems.id, command.sessionItemId),
        eq(trainingSessions.childId, command.childId),
        eq(trainingSessions.kind, "diagnostic"),
        eq(trainingSessions.status, "in_progress"),
        eq(diagnosticRuns.status, "in_progress"),
        eq(trainingSessions.diagnosticPartNumber, diagnosticRuns.currentPart),
      )).get();
    if (!item || item.partNumber === null) throw new DiagnosisAccessError();
    if (tx.select({ id: attempts.id }).from(attempts)
      .where(eq(attempts.sessionItemId, command.sessionItemId)).limit(1).get()) {
      throw new DiagnosisAccessError();
    }

    const spec = answerSpecSchema.parse(JSON.parse(item.answerSpec));
    const score = scoreAnswer(command.answerText, spec);
    const completedInPart = tx.select({ value: count() }).from(attempts)
      .innerJoin(sessionItems, eq(attempts.sessionItemId, sessionItems.id))
      .where(eq(sessionItems.sessionId, item.sessionId)).get()?.value ?? 0;
    const partCompleted = completedInPart + 1 === SLOTS_PER_PART;

    const attemptId = randomUUID();
    tx.insert(attempts).values({
      id: attemptId,
      sessionItemId: command.sessionItemId,
      clientSubmissionId: command.clientSubmissionId,
      answerText: command.answerText,
      isCorrect: score.correct,
      normalizedAnswer: score.normalizedAnswer,
      explanation: item.explanation,
      sessionCompleted: partCompleted,
      submittedAt: now,
    }).run();

    if (!score.correct) {
      recordSystemErrorObservation(tx, {
        childId: command.childId, sessionItemId: command.sessionItemId, attemptId,
        answerText: command.answerText, answerSpecSnapshot: item.answerSpec,
        stemSnapshot: item.stem, structureTagSnapshot: item.structureTag,
        selectionReasonSnapshot: item.metadata, now,
      });
    }

    const partNumber = item.partNumber as DiagnosticPartNumber;
    if (!partCompleted) {
      createNextItem(tx, {
        id: item.runId,
        childId: item.childId,
        seed: item.runSeed,
      }, partNumber, now, runtime);
    } else {
      tx.update(trainingSessions).set({ status: "completed", completedAt: now })
        .where(eq(trainingSessions.id, item.sessionId)).run();
      tx.update(diagnosticParts).set({ status: "completed", completedAt: now }).where(and(
        eq(diagnosticParts.runId, item.runId),
        eq(diagnosticParts.partNumber, partNumber),
      )).run();

      if (partNumber < 3) {
        const nextPart = (partNumber + 1) as DiagnosticPartNumber;
        tx.update(diagnosticRuns).set({ currentPart: nextPart })
          .where(eq(diagnosticRuns.id, item.runId)).run();
        tx.update(diagnosticParts).set({ status: "in_progress", startedAt: now }).where(and(
          eq(diagnosticParts.runId, item.runId),
          eq(diagnosticParts.partNumber, nextPart),
        )).run();
        createNextItem(tx, {
          id: item.runId,
          childId: item.childId,
          seed: item.runSeed,
        }, nextPart, now, runtime);
      } else {
        const report = deriveInitialReport(answerHistory(tx, item.runId));
        importDiagnosticEvidence(tx, item.runId, command.childId);
        tx.update(diagnosticRuns).set({
          status: "completed",
          currentPart: 3,
          completedAt: now,
          reportSnapshot: JSON.stringify(report),
        }).where(eq(diagnosticRuns.id, item.runId)).run();
      }
    }

    return {
      ...score,
      explanation: item.explanation,
      diagnosis: viewForRun(tx, command.childId, item.runId),
    };
  }, { behavior: "immediate" });
}

export function startDiagnosisRetest(
  db: AppDatabase,
  command: { childId: string; expectedCompletedVersion: number },
  now = Date.now(),
  runtime: DiagnosisRuntime = {},
): DiagnosisView {
  return db.transaction((tx) => {
    const previous = latestRun(tx, command.childId);
    if (!previous) throw new DiagnosisStateError("No completed diagnosis is available");
    if (previous.status !== "completed") {
      const hasCompleted = tx.select({ id: diagnosticRuns.id }).from(diagnosticRuns).where(and(
        eq(diagnosticRuns.childId, command.childId),
        eq(diagnosticRuns.status, "completed"),
      )).limit(1).get();
      if (hasCompleted) {
        throw new DiagnosisRetestConflictError("retest_already_active", previous.version);
      }
      throw new DiagnosisStateError("Complete the current diagnosis before starting a retest");
    }
    if (previous.version !== command.expectedCompletedVersion) {
      throw new DiagnosisRetestConflictError("version_conflict", previous.version);
    }
    const runId = createRun(tx, command.childId, previous.version + 1, now, runtime);
    return viewForRun(tx, command.childId, runId);
  }, { behavior: "immediate" });
}
