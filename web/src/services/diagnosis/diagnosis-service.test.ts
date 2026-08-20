import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { and, eq, ne } from "drizzle-orm";
import { phase2Catalog, phase2Skills } from "@/content/phase2-catalog";
import { createDatabase } from "@/db/client";
import { migrateDatabase } from "@/db/migrate";
import {
  attempts,
  diagnosticParts,
  diagnosticRuns,
  questionTemplates,
  sessionItems,
  skills,
  trainingSessions,
  users,
} from "@/db/schema";
import { answerSpecSchema } from "@/domain/questions/answer-spec";
import { instantiateTemplate } from "@/domain/questions/instantiate-template";
import { createTestDatabase } from "@/test/test-db";
import {
  DiagnosisAccessError,
  DiagnosisStateError,
  getDiagnosisView,
  getOrCreateDiagnosis,
  startDiagnosisRetest,
  submitDiagnosticAttempt,
} from "./diagnosis-service";

type TestDatabase = ReturnType<typeof createTestDatabase>;

function seedDiagnosisDatabase(db: TestDatabase = createTestDatabase()) {
  db.insert(users).values([
    { id: "child-1", role: "child", displayName: "孩子一", credentialHash: "hash", createdAt: 1 },
    { id: "child-2", role: "child", displayName: "孩子二", credentialHash: "hash", createdAt: 1 },
  ]).run();
  db.insert(skills).values(phase2Skills).run();
  db.insert(questionTemplates).values(phase2Catalog.map((template) => {
    const instance = instantiateTemplate(template, `seed:${template.id}`);
    return {
      id: template.id,
      skillId: `skill-${template.skillCode}`,
      domain: template.domain,
      contentTier: template.contentTier,
      structureTag: template.structureTag,
      estimatedSeconds: template.estimatedSeconds,
      readingLoad: template.readingLoad,
      answerMode: template.answerMode,
      variantSpec: JSON.stringify(template.variantSpec),
      hintLadder: JSON.stringify(template.hintLadder),
      stem: instance.stem,
      answerSpec: JSON.stringify(instance.answerSpec),
      explanation: instance.explanation,
      difficulty: template.difficulty,
      active: true,
    };
  })).run();
  return db;
}

function correctAnswerFor(db: TestDatabase, itemId: string): string {
  const item = db.select({ answerSpec: sessionItems.answerSpecSnapshot })
    .from(sessionItems).where(eq(sessionItems.id, itemId)).get()!;
  const spec = answerSpecSchema.parse(JSON.parse(item.answerSpec));
  return spec.kind === "choice" ? spec.value : `${spec.value}${spec.unit ?? ""}`;
}

function submitCurrent(db: TestDatabase, childId: string, submissionNumber: number) {
  const view = getDiagnosisView(db, childId);
  expect(view.currentItem).not.toBeNull();
  return submitDiagnosticAttempt(db, {
    childId,
    sessionItemId: view.currentItem!.id,
    clientSubmissionId: `00000000-0000-4000-8000-${String(submissionNumber).padStart(12, "0")}`,
    answerText: correctAnswerFor(db, view.currentItem!.id),
  }, 1_700_000_000_000 + submissionNumber);
}

describe("diagnosis service", () => {
  it("creates version one with an immutable current item and resumes that item", () => {
    const db = seedDiagnosisDatabase();

    const first = getOrCreateDiagnosis(db, "child-1", 1_700_000_000_000);
    expect(first).toMatchObject({
      version: 1,
      status: "in_progress",
      currentPart: 1,
      completedSlots: 0,
      totalSlots: 45,
      currentItem: { position: 1 },
    });
    expect(first.currentItem?.answerMode).toBeTruthy();
    const snapshotBeforeEdit = JSON.parse(db.select({ metadata: sessionItems.selectionReasonSnapshot })
      .from(sessionItems).where(eq(sessionItems.id, first.currentItem!.id)).get()!.metadata);
    expect(snapshotBeforeEdit).toMatchObject({
      snapshotVersion: 1,
      estimatedSeconds: expect.any(Number),
      readingLoad: expect.stringMatching(/^(short|medium|long)$/),
      commonErrors: expect.any(Array),
      source: "original",
      licenseStatus: "owned",
    });
    const currentTemplateId = db.select({ id: sessionItems.questionTemplateId })
      .from(sessionItems).where(eq(sessionItems.id, first.currentItem!.id)).get()!.id;
    db.update(questionTemplates).set({
      estimatedSeconds: 999,
      readingLoad: "long",
      answerMode: "fill",
    }).where(eq(questionTemplates.id, currentTemplateId)).run();

    const resumed = getOrCreateDiagnosis(db, "child-1", 1_700_000_060_000);
    expect(resumed.currentItem?.id).toBe(first.currentItem?.id);
    expect(resumed.currentItem?.answerMode).toBe(first.currentItem?.answerMode);
    expect(JSON.parse(db.select({ metadata: sessionItems.selectionReasonSnapshot })
      .from(sessionItems).where(eq(sessionItems.id, first.currentItem!.id)).get()!.metadata))
      .toEqual(snapshotBeforeEdit);
    expect(db.select().from(sessionItems).all()).toHaveLength(1);
  });

  it("persists one attempt for duplicate and concurrent-style retries", () => {
    const db = seedDiagnosisDatabase();
    const first = getOrCreateDiagnosis(db, "child-1", 1);
    const command = {
      childId: "child-1",
      sessionItemId: first.currentItem!.id,
      clientSubmissionId: "11111111-1111-4111-8111-111111111111",
      answerText: correctAnswerFor(db, first.currentItem!.id),
    };

    const result = submitDiagnosticAttempt(db, command, 2);
    expect(submitDiagnosticAttempt(db, command, 3)).toEqual(result);
    submitDiagnosticAttempt(db, {
      childId: "child-1",
      sessionItemId: result.diagnosis.currentItem!.id,
      clientSubmissionId: "13131313-1313-4313-8313-131313131313",
      answerText: "wrong",
    }, 4);
    expect(submitDiagnosticAttempt(db, command, 5)).toEqual(result);
    expect(db.select().from(attempts)
      .where(eq(attempts.clientSubmissionId, command.clientSubmissionId)).all()).toHaveLength(1);
    expect(db.select().from(sessionItems).all()).toHaveLength(3);
  });

  it("returns the same persisted result when two database connections retry one submission", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "diagnosis-retry-"));
    const filename = path.join(directory, "test.sqlite");
    const firstConnection = createDatabase(filename);
    migrateDatabase(firstConnection, path.resolve(process.cwd(), "drizzle"));
    seedDiagnosisDatabase(firstConnection);
    const secondConnection = createDatabase(filename);

    try {
      const first = getOrCreateDiagnosis(firstConnection, "child-1", 1);
      const command = {
        childId: "child-1",
        sessionItemId: first.currentItem!.id,
        clientSubmissionId: "12121212-1212-4212-8212-121212121212",
        answerText: correctAnswerFor(firstConnection, first.currentItem!.id),
      };
      const persisted = submitDiagnosticAttempt(firstConnection, command, 2);
      expect(submitDiagnosticAttempt(secondConnection, command, 3)).toEqual(persisted);
      expect(secondConnection.select().from(attempts)
        .where(eq(attempts.clientSubmissionId, command.clientSubmissionId)).all()).toHaveLength(1);
    } finally {
      firstConnection.$client.close();
      secondConnection.$client.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("binds submission IDs to the child and exact item", () => {
    const db = seedDiagnosisDatabase();
    const first = getOrCreateDiagnosis(db, "child-1", 1);
    const command = {
      childId: "child-1",
      sessionItemId: first.currentItem!.id,
      clientSubmissionId: "22222222-2222-4222-8222-222222222222",
      answerText: correctAnswerFor(db, first.currentItem!.id),
    };
    const result = submitDiagnosticAttempt(db, command, 2);

    expect(() => submitDiagnosticAttempt(db, { ...command, childId: "child-2" }, 3))
      .toThrow(DiagnosisAccessError);
    expect(() => submitDiagnosticAttempt(db, {
      ...command,
      sessionItemId: result.diagnosis.currentItem!.id,
    }, 3)).toThrow(DiagnosisAccessError);
    expect(db.select().from(attempts).all()).toHaveLength(1);
  });

  it("rejects a submission ID previously bound to a daily item with a controlled access error", () => {
    const db = seedDiagnosisDatabase();
    const diagnosis = getOrCreateDiagnosis(db, "child-1", 1);
    db.insert(trainingSessions).values({
      id: "daily-session", childId: "child-1", sessionDate: "2026-08-20",
      kind: "daily", status: "in_progress", startedAt: 1,
    }).run();
    db.insert(sessionItems).values({
      id: "daily-item", sessionId: "daily-session", questionTemplateId: "num-int-mental-01",
      position: 1, stemSnapshot: "daily", answerSpecSnapshot: JSON.stringify({ kind: "number", value: 1, tolerance: 0, unit: null }),
      explanationSnapshot: "daily", skillIdSnapshot: "skill-integer-mental", skillNameSnapshot: "整数口算",
    }).run();
    db.insert(attempts).values({
      id: "daily-attempt", sessionItemId: "daily-item",
      clientSubmissionId: "23232323-2323-4323-8323-232323232323",
      answerText: "1", isCorrect: true, normalizedAnswer: "1", explanation: "daily",
      sessionCompleted: false, submittedAt: 1,
    }).run();

    expect(() => submitDiagnosticAttempt(db, {
      childId: "child-1",
      sessionItemId: diagnosis.currentItem!.id,
      clientSubmissionId: "23232323-2323-4323-8323-232323232323",
      answerText: "1",
    }, 2)).toThrow(DiagnosisAccessError);
    expect(db.select().from(attempts).all()).toHaveLength(1);
  });

  it("rolls the attempt back when the next immutable snapshot cannot be created", () => {
    const db = seedDiagnosisDatabase();
    const first = getOrCreateDiagnosis(db, "child-1", 1);
    db.update(questionTemplates).set({ active: false }).where(and(
      eq(questionTemplates.domain, "number_operations"),
      ne(questionTemplates.id, db.select({ id: sessionItems.questionTemplateId })
        .from(sessionItems).where(eq(sessionItems.id, first.currentItem!.id)).get()!.id),
    )).run();

    expect(() => submitDiagnosticAttempt(db, {
      childId: "child-1",
      sessionItemId: first.currentItem!.id,
      clientSubmissionId: "33333333-3333-4333-8333-333333333333",
      answerText: "0",
    }, 2)).toThrow();
    expect(db.select().from(attempts).all()).toHaveLength(0);
    expect(getDiagnosisView(db, "child-1").completedSlots).toBe(0);
  });

  it("completes each 15-slot part and creates the final report without a daily session", () => {
    const db = seedDiagnosisDatabase();
    getOrCreateDiagnosis(db, "child-1", 1);

    for (let index = 1; index <= 45; index += 1) {
      const result = submitCurrent(db, "child-1", index);
      if (index === 15) expect(result.diagnosis).toMatchObject({ currentPart: 2, completedSlots: 15 });
      if (index === 30) expect(result.diagnosis).toMatchObject({ currentPart: 3, completedSlots: 30 });
    }

    const completed = getDiagnosisView(db, "child-1");
    expect(completed).toMatchObject({ status: "completed", currentPart: 3, completedSlots: 45 });
    expect(completed.currentItem).toBeNull();
    expect(db.select().from(diagnosticParts)
      .where(eq(diagnosticParts.status, "completed")).all()).toHaveLength(3);
    const run = db.select().from(diagnosticRuns).where(eq(diagnosticRuns.id, completed.runId)).get()!;
    expect(JSON.parse(run.reportSnapshot!)).toMatchObject({ skills: expect.any(Array), domains: expect.any(Array) });
    expect(db.select().from(trainingSessions)
      .where(eq(trainingSessions.kind, "daily")).all()).toHaveLength(0);
  });

  it("rejects premature retests and preserves completed version one when starting version two", () => {
    const db = seedDiagnosisDatabase();
    getOrCreateDiagnosis(db, "child-1", 1);
    expect(() => startDiagnosisRetest(db, "child-1", 2)).toThrow(DiagnosisStateError);
    for (let index = 1; index <= 45; index += 1) submitCurrent(db, "child-1", index);

    const second = startDiagnosisRetest(db, "child-1", 100);
    expect(second).toMatchObject({ version: 2, status: "in_progress", completedSlots: 0 });
    expect(() => startDiagnosisRetest(db, "child-1", 101)).toThrow(DiagnosisStateError);
    expect(db.select({ version: diagnosticRuns.version, status: diagnosticRuns.status })
      .from(diagnosticRuns).where(eq(diagnosticRuns.childId, "child-1"))
      .orderBy(diagnosticRuns.version).all()).toEqual([
      { version: 1, status: "completed" },
      { version: 2, status: "in_progress" },
    ]);
  });
});
