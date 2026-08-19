import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { constants } from "node:sqlite";
import { eq } from "drizzle-orm";
import { createDatabase, type AppDatabase } from "@/db/client";
import { migrateDatabase } from "@/db/migrate";
import {
  attempts,
  masteryStates,
  questionTemplates,
  skills,
  trainingSessions,
  users,
} from "@/db/schema";
import { createTestDatabase } from "@/test/test-db";
import { getOrCreateDailySession } from "./create-daily-session";
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
      explanation: "对齐十分位。",
      difficulty: 1,
      active: true,
    },
    {
      id: "q-equation-1",
      skillId: "skill-equation",
      stem: "3x + 5 = 26，x 等于多少？",
      answerSpec: JSON.stringify({ kind: "number", value: 7, tolerance: 0, unit: null }),
      explanation: "先减 5，再除以 3。",
      difficulty: 2,
      active: true,
    },
    {
      id: "q-reading-1",
      skillId: "skill-reading",
      stem: "每盒彩笔 7.5 元，买 1 盒需要付多少钱？",
      answerSpec: JSON.stringify({ kind: "number", value: 7.5, tolerance: 0, unit: "元" }),
      explanation: "答案要带单位。",
      difficulty: 1,
      active: true,
    },
  ]).run();
  return db;
}

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
