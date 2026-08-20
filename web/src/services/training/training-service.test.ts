import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { constants } from "node:sqlite";
import { eq } from "drizzle-orm";
import { createDatabase, type AppDatabase } from "@/db/client";
import { migrateDatabase } from "@/db/migrate";
import {
  attempts,
  diagnosticRuns,
  errorObservations,
  masteryStates,
  questionTemplates,
  sessionItems,
  skills,
  trainingSessions,
  users,
} from "@/db/schema";
import { createTestDatabase } from "@/test/test-db";
import { getOrCreateDailySession } from "./create-daily-session";
import { getParentEvidence } from "./get-parent-evidence";
import {
  InvalidAnswerError,
  submitAttempt,
  TrainingAccessError,
} from "./submit-attempt";

function seedTrainingDatabase(db: AppDatabase = createTestDatabase()) {
  db.insert(users).values({
    id: "child-1",
    role: "child",
    displayName: "孩子",
    credentialHash: "hash",
    createdAt: 1,
  }).run();
  db.insert(skills).values([
    { id: "skill-decimal", code: "decimal", name: "小数计算", domain: "数与运算" },
    { id: "skill-equation", code: "equation", name: "一步方程", domain: "方程与代数意识" },
    { id: "skill-reading", code: "reading", name: "读题与单位", domain: "数学思维与学习习惯" },
  ]).run();
  db.insert(questionTemplates).values([
    {
      id: "q-decimal-1",
      skillId: "skill-decimal",
      stem: "3.6 + 2.4 = ?",
      answerSpec: JSON.stringify({ kind: "number", value: 6, tolerance: 0, unit: null }),
      hintLadder: JSON.stringify(["先看小数位。", "把相同数位对齐。", "逐位相加并检查小数点。"]),
      explanation: "对齐十分位。",
      difficulty: 1,
      active: true,
    },
    {
      id: "q-equation-1",
      skillId: "skill-equation",
      stem: "3x + 5 = 26，x 等于多少？",
      answerSpec: JSON.stringify({ kind: "number", value: 7, tolerance: 0, unit: null }),
      hintLadder: JSON.stringify(["先找 x。", "等式两边做相同运算。", "先减 5 再除以 3。"]),
      explanation: "先减 5，再除以 3。",
      difficulty: 2,
      active: true,
    },
    {
      id: "q-reading-1",
      skillId: "skill-reading",
      stem: "每盒彩笔 7.5 元，买 1 盒需要付多少钱？",
      answerSpec: JSON.stringify({ kind: "number", value: 7.5, tolerance: 0, unit: "元" }),
      hintLadder: JSON.stringify(["圈出问题。", "留意单位。", "答案写‘元’。"]),
      explanation: "答案要带单位。",
      difficulty: 1,
      active: true,
    },
    {
      id: "aa-phase2-distractor",
      skillId: "skill-decimal",
      stem: "不应进入 Phase 1 日训",
      answerSpec: JSON.stringify({ kind: "number", value: 99, tolerance: 0, unit: null }),
      hintLadder: JSON.stringify(["提示一", "提示二", "提示三"]),
      explanation: "Phase 2 题库由后续排课器接管。",
      difficulty: -100,
      active: true,
    },
  ]).run();
  db.insert(diagnosticRuns).values({
    id: "completed-diagnosis", childId: "child-1", version: 1, status: "completed",
    currentPart: 3, seed: "seed", startedAt: 1, completedAt: 2, reportSnapshot: "{}",
  }).run();
  return db;
}

test("blocks a new daily session until diagnosis completes but still reads historical daily sessions", () => {
  const db = seedTrainingDatabase();
  const historical = getOrCreateDailySession(db, "child-1", "2026-08-18");
  db.delete(diagnosticRuns).where(eq(diagnosticRuns.id, "completed-diagnosis")).run();

  expect(getOrCreateDailySession(db, "child-1", "2026-08-18").id).toBe(historical.id);
  expect(() => getOrCreateDailySession(db, "child-1", "2026-08-19")).toThrow("Diagnosis must be completed");
  expect(db.select().from(trainingSessions).where(eq(trainingSessions.kind, "daily")).all())
    .toHaveLength(1);
});

test("does not mistake a same-day diagnostic session for an existing daily session", () => {
  const db = seedTrainingDatabase();
  db.insert(trainingSessions).values({
    id: "diagnostic-session", childId: "child-1", sessionDate: "2026-08-19",
    kind: "diagnostic", diagnosticRunId: "completed-diagnosis", diagnosticPartNumber: 1,
    status: "completed", startedAt: 1, completedAt: 2,
  }).run();

  const daily = getOrCreateDailySession(db, "child-1", "2026-08-19");
  expect(daily.id).not.toBe("diagnostic-session");
  expect(db.select().from(trainingSessions).where(eq(trainingSessions.kind, "daily")).all())
    .toHaveLength(1);
});

test("creates one reusable session with three reviewed questions without answer data", () => {
  const db = seedTrainingDatabase();

  const first = getOrCreateDailySession(db, "child-1", "2026-08-19");
  const second = getOrCreateDailySession(db, "child-1", "2026-08-19");

  expect(second.id).toBe(first.id);
  expect(first.questions).toEqual([
    { id: expect.any(String), position: 0, stem: "3.6 + 2.4 = ?", answered: false },
    { id: expect.any(String), position: 1, stem: "每盒彩笔 7.5 元，买 1 盒需要付多少钱？", answered: false },
    { id: expect.any(String), position: 2, stem: "3x + 5 = 26，x 等于多少？", answered: false },
  ]);
  expect(db.select().from(trainingSessions).all()).toHaveLength(1);
  expect(first.currentPosition).toBe(0);
});

test("keeps the Phase 1 daily pool and immutable metadata independent from Phase 2 catalog ordering", () => {
  const db = seedTrainingDatabase();
  db.update(questionTemplates).set({
    domain: "number_operations",
    contentTier: "regional",
    structureTag: "decimal-add",
    estimatedSeconds: 75,
    readingLoad: "medium",
    answerMode: "mental",
    commonErrors: JSON.stringify(["calculation"]),
    hintLadder: JSON.stringify(["先看小数位。", "把相同数位对齐。", "逐位相加并检查小数点。"]),
    readingCard: false,
    source: "original",
    licenseStatus: "owned",
  }).where(eq(questionTemplates.id, "q-decimal-1")).run();

  const session = getOrCreateDailySession(db, "child-1", "2026-08-20");
  expect(session.questions.map(({ stem }) => stem)).toEqual([
    "3.6 + 2.4 = ?",
    "每盒彩笔 7.5 元，买 1 盒需要付多少钱？",
    "3x + 5 = 26，x 等于多少？",
  ]);

  const snapshots = db.select().from(sessionItems)
    .where(eq(sessionItems.sessionId, session.id))
    .orderBy(sessionItems.position)
    .all();
  expect(snapshots[0]).toMatchObject({
    questionTemplateId: "q-decimal-1",
    difficultySnapshot: 1,
    contentTierSnapshot: "regional",
    structureTagSnapshot: "decimal-add",
    variantSeed: "phase1-static:q-decimal-1",
  });
  expect(JSON.parse(snapshots[0].selectionReasonSnapshot)).toEqual({
    snapshotVersion: 1,
    reason: "phase1_fixed_daily",
    answerMode: "mental",
    estimatedSeconds: 75,
    hintLadder: ["先看小数位。", "把相同数位对齐。", "逐位相加并检查小数点。"],
    readingLoad: "medium",
    commonErrors: ["calculation"],
    readingCard: false,
    source: "original",
    licenseStatus: "owned",
  });
});

test("copies reviewed error targets into a daily snapshot and classifies from that snapshot", () => {
  const db = seedTrainingDatabase();
  db.update(questionTemplates).set({
    answerMode: "choice",
    stem: "真正要求的是：A. 每盒数量  B. 盒数  C. 总支数  D. 赠送数量",
    answerSpec: JSON.stringify({ kind: "choice", value: "C" }),
    explanation: "问题要求总支数。",
    commonErrors: JSON.stringify(["incomplete_reading"]),
    variantSpec: JSON.stringify({
      variables: {},
      errorTargets: { incompleteReading: ["A", "B", "D"] },
    }),
  }).where(eq(questionTemplates.id, "q-decimal-1")).run();

  const session = getOrCreateDailySession(db, "child-1", "2026-08-20");
  const item = db.select().from(sessionItems).where(eq(sessionItems.id, session.questions[0].id)).get()!;
  expect(JSON.parse(item.selectionReasonSnapshot).errorTargets)
    .toEqual({ incompleteReading: ["A", "B", "D"] });
  db.update(questionTemplates).set({
    commonErrors: JSON.stringify(["relationship"]),
    variantSpec: JSON.stringify({ variables: {} }),
  }).where(eq(questionTemplates.id, "q-decimal-1")).run();
  submitAttempt(db, {
    childId: "child-1", sessionItemId: item.id,
    clientSubmissionId: "61616161-6161-4161-8161-616161616161", answerText: "A",
  });
  expect(db.select().from(errorObservations).where(eq(errorObservations.sessionItemId, item.id)).get())
    .toMatchObject({ systemCandidate: "incomplete_reading" });
});

test("keeps session scoring and parent evidence stable after a template edit", () => {
  const db = seedTrainingDatabase();
  const session = getOrCreateDailySession(db, "child-1", "2026-08-19");

  db.update(questionTemplates).set({
    skillId: "skill-equation",
    stem: "后来修改的题目",
    answerSpec: JSON.stringify({ kind: "number", value: 99, tolerance: 0, unit: null }),
    explanation: "后来修改的解析。",
  }).where(eq(questionTemplates.id, "q-decimal-1")).run();

  expect(getOrCreateDailySession(db, "child-1", "2026-08-19").questions[0].stem)
    .toBe("3.6 + 2.4 = ?");
  expect(submitAttempt(db, {
    childId: "child-1",
    sessionItemId: session.questions[0].id,
    clientSubmissionId: "12121212-1212-4212-8212-121212121212",
    answerText: "6",
  })).toMatchObject({
    correct: true,
    explanation: "对齐十分位。",
  });
  expect(db.select().from(masteryStates).where(eq(masteryStates.childId, "child-1")).get())
    .toMatchObject({ skillId: "skill-decimal", correctCount: 1 });
  expect(getParentEvidence(db, "child-1").recent[0]).toMatchObject({
    stem: "3.6 + 2.4 = ?",
    skillName: "小数计算",
  });
});

test("does not duplicate an attempt or evidence for the same client submission", () => {
  const db = seedTrainingDatabase();
  const session = getOrCreateDailySession(db, "child-1", "2026-08-19");
  const command = {
    childId: "child-1",
    sessionItemId: session.questions[0].id,
    clientSubmissionId: "11111111-1111-4111-8111-111111111111",
    answerText: "6",
  };

  const first = submitAttempt(db, command);
  const retry = submitAttempt(db, command);

  expect(retry).toEqual(first);
  expect(db.select().from(attempts).all()).toHaveLength(1);
  expect(db.select().from(masteryStates).where(eq(masteryStates.childId, "child-1")).get()?.evidenceCount)
    .toBe(1);
});

test("rejects a reused submission ID for a different, missing, or foreign item", () => {
  const db = seedTrainingDatabase();
  db.insert(users).values({
    id: "child-2",
    role: "child",
    displayName: "另一个孩子",
    credentialHash: "hash",
    createdAt: 1,
  }).run();
  db.insert(diagnosticRuns).values({
    id: "completed-diagnosis-2", childId: "child-2", version: 1, status: "completed",
    currentPart: 3, seed: "seed-2", startedAt: 1, completedAt: 2, reportSnapshot: "{}",
  }).run();
  const session = getOrCreateDailySession(db, "child-1", "2026-08-19");
  const foreignSession = getOrCreateDailySession(db, "child-2", "2026-08-19");
  const clientSubmissionId = "77777777-7777-4777-8777-777777777777";

  submitAttempt(db, {
    childId: "child-1",
    sessionItemId: session.questions[0].id,
    clientSubmissionId,
    answerText: "6",
  });

  for (const sessionItemId of [
    session.questions[1].id,
    "missing-item",
    foreignSession.questions[0].id,
  ]) {
    expect(() => submitAttempt(db, {
      childId: "child-1",
      sessionItemId,
      clientSubmissionId,
      answerText: "7.5 元",
    })).toThrow(TrainingAccessError);
  }
  expect(db.select().from(attempts).all()).toHaveLength(1);
  expect(db.select().from(masteryStates).all()).toHaveLength(1);
});

test("replays the original result after later completion and template edits", () => {
  const db = seedTrainingDatabase();
  const session = getOrCreateDailySession(db, "child-1", "2026-08-19");
  const command = {
    childId: "child-1",
    sessionItemId: session.questions[0].id,
    clientSubmissionId: "88888888-8888-4888-8888-888888888888",
    answerText: "06",
  };
  const original = submitAttempt(db, command);

  submitAttempt(db, {
    childId: "child-1",
    sessionItemId: session.questions[1].id,
    clientSubmissionId: "88888888-8888-4888-8888-888888888881",
    answerText: "7.5 元",
  });
  submitAttempt(db, {
    childId: "child-1",
    sessionItemId: session.questions[2].id,
    clientSubmissionId: "88888888-8888-4888-8888-888888888882",
    answerText: "7",
  });
  db.update(questionTemplates).set({
    answerSpec: JSON.stringify({ kind: "number", value: 6, tolerance: 0, unit: "元" }),
    explanation: "后来修改的解析。",
  }).where(eq(questionTemplates.id, "q-decimal-1")).run();

  expect(original).toEqual({
    correct: true,
    normalizedAnswer: "6",
    explanation: "对齐十分位。",
    sessionCompleted: false,
  });
  expect(submitAttempt(db, command)).toEqual(original);
});

test("reads a session view from one snapshot while another connection writes", () => {
  const directory = mkdtempSync(join(tmpdir(), "math-trainer-session-view-"));
  const filename = join(directory, "training.sqlite");
  const firstDb = createDatabase(filename);
  migrateDatabase(firstDb, join(process.cwd(), "drizzle"));
  const secondDb = createDatabase(filename);

  try {
    firstDb.$client.exec("PRAGMA journal_mode = WAL");
    secondDb.$client.exec("PRAGMA journal_mode = WAL");
    seedTrainingDatabase(firstDb);
    const session = getOrCreateDailySession(firstDb, "child-1", "2026-08-19");
    let insertedDuringRead = false;

    firstDb.$client.setAuthorizer((actionCode, tableName) => {
      if (!insertedDuringRead && actionCode === constants.SQLITE_READ && tableName === "attempts") {
        insertedDuringRead = true;
        secondDb.insert(attempts).values({
          id: "concurrent-attempt",
          sessionItemId: session.questions[0].id,
          clientSubmissionId: "99999999-9999-4999-8999-999999999999",
          answerText: "6",
          isCorrect: true,
          normalizedAnswer: "6",
          explanation: "对齐十分位。",
          sessionCompleted: false,
          submittedAt: 2,
        }).run();
      }
      return constants.SQLITE_OK;
    });

    const duringWrite = getOrCreateDailySession(firstDb, "child-1", "2026-08-19");
    firstDb.$client.setAuthorizer(null);

    expect(insertedDuringRead).toBe(true);
    expect(duringWrite.questions[0].answered).toBe(false);
    expect(getOrCreateDailySession(firstDb, "child-1", "2026-08-19").questions[0].answered)
      .toBe(true);
  } finally {
    firstDb.$client.setAuthorizer(null);
    firstDb.$client.close();
    secondDb.$client.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("keeps the last item available when its latest answer is incorrect", () => {
  const db = seedTrainingDatabase();
  const session = getOrCreateDailySession(db, "child-1", "2026-08-19");

  submitAttempt(db, {
    childId: "child-1",
    sessionItemId: session.questions[0].id,
    clientSubmissionId: "33333333-3333-4333-8333-333333333329",
    answerText: "6",
  });
  submitAttempt(db, {
    childId: "child-1",
    sessionItemId: session.questions[1].id,
    clientSubmissionId: "33333333-3333-4333-8333-333333333330",
    answerText: "7.5 元",
  });

  const incorrect = submitAttempt(db, {
    childId: "child-1",
    sessionItemId: session.questions[2].id,
    clientSubmissionId: "33333333-3333-4333-8333-333333333331",
    answerText: "6",
  });
  const afterIncorrect = getOrCreateDailySession(db, "child-1", "2026-08-19");

  expect(incorrect.sessionCompleted).toBe(false);
  expect(afterIncorrect.status).toBe("in_progress");
  expect(afterIncorrect.questions[2].answered).toBe(false);
  expect(afterIncorrect.currentPosition).toBe(2);

  const corrected = submitAttempt(db, {
    childId: "child-1",
    sessionItemId: session.questions[2].id,
    clientSubmissionId: "33333333-3333-4333-8333-333333333332",
    answerText: "7",
  });
  expect(corrected.sessionCompleted).toBe(true);
});

test("completes only after all three items have a correct answer", () => {
  const db = seedTrainingDatabase();
  const session = getOrCreateDailySession(db, "child-1", "2026-08-19");
  const answers = ["6", "7.5 元", "7"];
  let completed = false;

  session.questions.forEach((question, index) => {
    completed = submitAttempt(db, {
      childId: "child-1",
      sessionItemId: question.id,
      clientSubmissionId: `22222222-2222-4222-8222-22222222222${index}`,
      answerText: answers[index],
    }).sessionCompleted;
  });

  expect(completed).toBe(true);
  const completedSession = getOrCreateDailySession(db, "child-1", "2026-08-19");
  expect(completedSession.status).toBe("completed");
  expect(completedSession.currentPosition).toBe(3);
});

test("rejects unavailable items and overlong answers without writing attempts", () => {
  const db = seedTrainingDatabase();
  const session = getOrCreateDailySession(db, "child-1", "2026-08-19");

  expect(() => submitAttempt(db, {
    childId: "another-child",
    sessionItemId: session.questions[0].id,
    clientSubmissionId: "44444444-4444-4444-8444-444444444441",
    answerText: "6",
  })).toThrow(TrainingAccessError);
  expect(() => submitAttempt(db, {
    childId: "child-1",
    sessionItemId: session.questions[0].id,
    clientSubmissionId: "44444444-4444-4444-8444-444444444442",
    answerText: "1".repeat(129),
  })).toThrow(InvalidAnswerError);
  expect(db.select().from(attempts).all()).toHaveLength(0);
});
