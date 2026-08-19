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

function seededDatabaseWithOneCorrectAndOneIncorrectAttempt() {
  const db = createTestDatabase();

  db.insert(users).values({
    id: "child-1",
    role: "child",
    displayName: "孩子",
    credentialHash: "hash",
    createdAt: 1,
  }).run();
  db.insert(skills).values({
    id: "skill-reading",
    code: "reading",
    name: "读题与单位",
    domain: "数学思维与学习习惯",
  }).run();
  db.insert(questionTemplates).values({
    id: "q-reading-1",
    skillId: "skill-reading",
    stem: "每盒彩笔 7.5 元，买 1 盒需要付多少钱？请写单位。",
    answerSpec: JSON.stringify({ kind: "number", value: 7.5, tolerance: 0, unit: "元" }),
    explanation: "答案必须带单位。",
    difficulty: 1,
    active: true,
  }).run();
  db.insert(trainingSessions).values({
    id: "session-1",
    childId: "child-1",
    sessionDate: "2026-08-19",
    status: "completed",
    startedAt: 1,
    completedAt: 3,
  }).run();
  db.insert(sessionItems).values({
    id: "item-reading-1",
    sessionId: "session-1",
    questionTemplateId: "q-reading-1",
    position: 0,
  }).run();
  db.insert(attempts).values([
    {
      id: "attempt-incorrect",
      sessionItemId: "item-reading-1",
      clientSubmissionId: "submission-incorrect",
      answerText: "7.5",
      isCorrect: false,
      normalizedAnswer: "7.5",
      explanation: "答案必须带单位。",
      sessionCompleted: false,
      submittedAt: 2,
    },
    {
      id: "attempt-correct",
      sessionItemId: "item-reading-1",
      clientSubmissionId: "submission-correct",
      answerText: "7.5 元",
      isCorrect: true,
      normalizedAnswer: "7.5 元",
      explanation: "答案必须带单位。",
      sessionCompleted: true,
      submittedAt: 3,
    },
  ]).run();
  db.insert(masteryStates).values({
    childId: "child-1",
    skillId: "skill-reading",
    status: "learning",
    evidenceCount: 2,
    correctCount: 1,
    updatedAt: 3,
  }).run();

  return db;
}

test("summarizes attempts without hiding the supporting question", () => {
  const db = seededDatabaseWithOneCorrectAndOneIncorrectAttempt();
  const evidence = getParentEvidence(db, "child-1");

  expect(evidence.summary).toEqual({ answered: 2, correct: 1, accuracy: 0.5 });
  expect(evidence.recent[0]).toMatchObject({
    stem: "每盒彩笔 7.5 元，买 1 盒需要付多少钱？请写单位。",
    answerText: "7.5 元",
    correct: true,
    submittedAt: 3,
    skillName: "读题与单位",
  });
  expect(evidence.skills).toEqual([
    { skillName: "读题与单位", status: "learning", evidenceCount: 2 },
  ]);
});

test("returns an empty evidence summary when the child has not answered", () => {
  const db = createTestDatabase();

  expect(getParentEvidence(db, "child-without-attempts")).toEqual({
    summary: { answered: 0, correct: 0, accuracy: null },
    recent: [],
    skills: [],
  });
});
