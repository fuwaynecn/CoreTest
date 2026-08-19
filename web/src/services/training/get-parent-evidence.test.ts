import { eq } from "drizzle-orm";
import {
  attempts,
  masteryStates,
  questionTemplates,
  sessionItems,
  skills,
  trainingSessions,
  users,
} from "@/db/schema";
import { createTestDatabase } from "@/test/test-db";
import { getParentEvidence } from "./get-parent-evidence";

const NOW = Date.parse("2026-08-19T12:00:00+08:00");

function seededAcceptedFlow() {
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
    { id: "skill-reading", code: "reading", name: "读题与单位", domain: "数学思维与学习习惯" },
    { id: "skill-equation", code: "equation", name: "一步方程", domain: "方程与代数意识" },
  ]).run();
  const templates = [
    {
      id: "q-decimal",
      skillId: "skill-decimal",
      skillName: "小数计算",
      stem: "3.6 + 2.4 = ?",
      answerSpec: JSON.stringify({ kind: "number", value: 6, tolerance: 0, unit: null }),
      explanation: "对齐十分位。",
    },
    {
      id: "q-reading",
      skillId: "skill-reading",
      skillName: "读题与单位",
      stem: "每盒彩笔 7.5 元，买 1 盒需要付多少钱？请写单位。",
      answerSpec: JSON.stringify({ kind: "number", value: 7.5, tolerance: 0, unit: "元" }),
      explanation: "答案必须带单位。",
    },
    {
      id: "q-equation",
      skillId: "skill-equation",
      skillName: "一步方程",
      stem: "3x + 5 = 26，x 等于多少？",
      answerSpec: JSON.stringify({ kind: "number", value: 7, tolerance: 0, unit: null }),
      explanation: "先减 5，再除以 3。",
    },
  ];
  db.insert(questionTemplates).values(templates.map((template, difficulty) => ({
    id: template.id,
    skillId: template.skillId,
    stem: template.stem,
    answerSpec: template.answerSpec,
    explanation: template.explanation,
    difficulty,
    active: true,
  }))).run();
  db.insert(trainingSessions).values({
    id: "session-1",
    childId: "child-1",
    sessionDate: "2026-08-19",
    status: "completed",
    startedAt: 1,
    completedAt: NOW,
  }).run();
  db.insert(sessionItems).values(templates.map((template, position) => ({
    id: `item-${template.id}`,
    sessionId: "session-1",
    questionTemplateId: template.id,
    position,
    stemSnapshot: template.stem,
    answerSpecSnapshot: template.answerSpec,
    explanationSnapshot: template.explanation,
    skillIdSnapshot: template.skillId,
    skillNameSnapshot: template.skillName,
  }))).run();
  db.insert(attempts).values([
    {
      id: "attempt-decimal",
      sessionItemId: "item-q-decimal",
      clientSubmissionId: "submission-decimal",
      answerText: "6",
      isCorrect: true,
      normalizedAnswer: "6",
      explanation: "对齐十分位。",
      sessionCompleted: false,
      submittedAt: Date.parse("2026-08-19T09:00:00+08:00"),
    },
    {
      id: "attempt-reading-incorrect",
      sessionItemId: "item-q-reading",
      clientSubmissionId: "submission-reading-incorrect",
      answerText: "7.5",
      isCorrect: false,
      normalizedAnswer: "7.5",
      explanation: "答案必须带单位。",
      sessionCompleted: false,
      submittedAt: Date.parse("2026-08-19T10:00:00+08:00"),
    },
    {
      id: "attempt-reading-correct",
      sessionItemId: "item-q-reading",
      clientSubmissionId: "submission-reading-correct",
      answerText: "7.5 元",
      isCorrect: true,
      normalizedAnswer: "7.5 元",
      explanation: "答案必须带单位。",
      sessionCompleted: false,
      submittedAt: Date.parse("2026-08-19T10:01:00+08:00"),
    },
    {
      id: "attempt-equation",
      sessionItemId: "item-q-equation",
      clientSubmissionId: "submission-equation",
      answerText: "7",
      isCorrect: true,
      normalizedAnswer: "7",
      explanation: "先减 5，再除以 3。",
      sessionCompleted: true,
      submittedAt: Date.parse("2026-08-19T11:00:00+08:00"),
    },
  ]).run();
  db.insert(masteryStates).values({
    childId: "child-1",
    skillId: "skill-reading",
    status: "learning",
    evidenceCount: 2,
    correctCount: 1,
    updatedAt: NOW,
  }).run();

  return db;
}

test("counts earliest attempts while retaining corrections in recent evidence", () => {
  const db = seededAcceptedFlow();
  const evidence = getParentEvidence(db, "child-1", NOW);

  expect(evidence.summary).toEqual({
    cumulative: { answered: 3, correct: 2, accuracy: 2 / 3 },
    today: { answered: 3, correct: 2, accuracy: 2 / 3 },
    week: { answered: 3, correct: 2, accuracy: 2 / 3 },
  });
  expect(evidence.recent.map((attempt) => attempt.answerText)).toEqual([
    "7",
    "7.5 元",
    "7.5",
    "6",
  ]);
  expect(evidence.recent.find((attempt) => attempt.answerText === "7.5")).toMatchObject({
    stem: "每盒彩笔 7.5 元，买 1 盒需要付多少钱？请写单位。",
    correct: false,
    skillName: "读题与单位",
  });
  expect(evidence.skills).toEqual([
    { skillName: "读题与单位", status: "learning", evidenceCount: 2 },
  ]);
});

test("uses Asia/Shanghai day and Monday week boundaries for first attempts", () => {
  const db = seededAcceptedFlow();
  db.update(attempts).set({ submittedAt: Date.parse("2026-08-16T23:59:59+08:00") })
    .where(eq(attempts.id, "attempt-decimal")).run();
  db.update(attempts).set({ submittedAt: Date.parse("2026-08-17T00:00:00+08:00") })
    .where(eq(attempts.id, "attempt-reading-incorrect")).run();
  db.update(attempts).set({ submittedAt: Date.parse("2026-08-19T00:00:00+08:00") })
    .where(eq(attempts.id, "attempt-equation")).run();

  expect(getParentEvidence(db, "child-1", NOW).summary).toEqual({
    cumulative: { answered: 3, correct: 2, accuracy: 2 / 3 },
    today: { answered: 1, correct: 1, accuracy: 1 },
    week: { answered: 2, correct: 1, accuracy: 0.5 },
  });
});

test("returns empty first-attempt metrics when the child has not answered", () => {
  const db = createTestDatabase();

  expect(getParentEvidence(db, "child-without-attempts", NOW)).toEqual({
    summary: {
      cumulative: { answered: 0, correct: 0, accuracy: null },
      today: { answered: 0, correct: 0, accuracy: null },
      week: { answered: 0, correct: 0, accuracy: null },
    },
    recent: [],
    skills: [],
  });
});
