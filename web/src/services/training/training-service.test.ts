import { eq } from "drizzle-orm";
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

function seedTrainingDatabase() {
  const db = createTestDatabase();
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
