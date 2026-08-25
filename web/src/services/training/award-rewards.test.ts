import { eq } from "drizzle-orm";
import { createTestDatabase } from "@/test/test-db";
import { attempts, questionTemplates, rewardEvents, sessionItems, skills, trainingSessions, users } from "@/db/schema";
import { submitAttempt } from "./submit-attempt";

function database() {
  const db = createTestDatabase();
  db.insert(users).values({ id: "child", role: "child", displayName: "孩子", credentialHash: "hash", createdAt: 1 }).run();
  db.insert(skills).values({ id: "skill", code: "skill", name: "技能", domain: "数学思维与学习习惯" }).run();
  db.insert(questionTemplates).values({
    id: "template", skillId: "skill", stem: "3 + 2 = ?", answerSpec: JSON.stringify({ kind: "number", value: 5, tolerance: 0, unit: null }),
    hintLadder: "[]", explanation: "解析", difficulty: 1, readingCard: true,
  }).run();
  db.insert(trainingSessions).values({ id: "session", childId: "child", sessionDate: "2026-08-25", kind: "daily", status: "in_progress", startedAt: 1 }).run();
  db.insert(sessionItems).values({
    id: "item", sessionId: "session", questionTemplateId: "template", position: 0, stemSnapshot: "3 + 2 = ?",
    answerSpecSnapshot: JSON.stringify({ kind: "number", value: 5, tolerance: 0, unit: null }), explanationSnapshot: "解析",
    skillIdSnapshot: "skill", skillNameSnapshot: "技能", difficultySnapshot: 1, selectionReasonSnapshot: JSON.stringify({ readingCard: true }),
  }).run();
  return db;
}

test("submitAttempt awards reading-card points once and returns lifetime total", () => {
  const db = database();
  const result = submitAttempt(db, {
    childId: "child", sessionItemId: "item", clientSubmissionId: "11111111-1111-4111-8111-111111111111", answerText: "5",
    readingCardResponse: { target: "目标", givens: "已知", units: "元", usefulFacts: "事实", relationship: "关系", estimateRange: "5-5" },
  });
  expect(result.rewards).toEqual({ pointsEarned: 8, totalPoints: 8, newBadges: [] });
  expect(submitAttempt(db, {
    childId: "child", sessionItemId: "item", clientSubmissionId: "11111111-1111-4111-8111-111111111111", answerText: "5",
  })).toEqual(result);
  expect(db.select().from(rewardEvents).where(eq(rewardEvents.childId, "child")).all()).toHaveLength(4);
  expect(db.select().from(attempts).all()).toHaveLength(1);
});
