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

test("awards one correction reward across repeated wrong and correct submissions", () => {
  const db = database();
  db.update(sessionItems).set({ selectionReasonSnapshot: "{}" }).where(eq(sessionItems.id, "item")).run();
  db.insert(sessionItems).values({ ...db.select().from(sessionItems).where(eq(sessionItems.id, "item")).get()!, id: "other", position: 1 }).run();
  const submit = (id: string, answerText: string) => submitAttempt(db, { childId: "child", sessionItemId: "item", clientSubmissionId: id, answerText });
  submit("11111111-1111-4111-8111-111111111112", "4");
  const firstCorrect = submit("11111111-1111-4111-8111-111111111113", "5");
  submit("11111111-1111-4111-8111-111111111114", "4");
  const secondCorrect = submit("11111111-1111-4111-8111-111111111115", "5");
  expect(firstCorrect.rewards.pointsEarned).toBe(3);
  expect(secondCorrect.rewards.pointsEarned).toBe(0);
  expect(db.select().from(rewardEvents).where(eq(rewardEvents.code, "correction")).all()).toHaveLength(1);
});

test("awards review recall and planned completion points", () => {
  const db = database();
  db.update(trainingSessions).set({ kind: "review" }).where(eq(trainingSessions.id, "session")).run();
  db.update(sessionItems).set({ selectionReasonSnapshot: JSON.stringify({ category: "review", reviewIntervalDays: 1 }) }).where(eq(sessionItems.id, "item")).run();
  const result = submitAttempt(db, { childId: "child", sessionItemId: "item", clientSubmissionId: "11111111-1111-4111-8111-111111111116", answerText: "5" });
  expect(result.rewards.pointsEarned).toBe(10);
  expect(db.select().from(rewardEvents).where(eq(rewardEvents.childId, "child")).all().filter((event) => event.kind === "points")).toHaveLength(2);
});

test("crossing the reading-card threshold inserts one badge and replays it", () => {
  const db = database();
  const item = db.select().from(sessionItems).where(eq(sessionItems.id, "item")).get()!;
  db.insert(sessionItems).values([
    { ...item, id: "item-2", position: 1 },
    { ...item, id: "item-3", position: 2 },
  ]).run();
  const response = (itemId: string, suffix: string) => submitAttempt(db, {
    childId: "child", sessionItemId: itemId, clientSubmissionId: `11111111-1111-4111-8111-11111111111${suffix}`, answerText: "5",
    readingCardResponse: { target: "目标", givens: "已知", units: "元", usefulFacts: "事实", relationship: "关系", estimateRange: "5-5" },
  });
  response("item", "7"); response("item-2", "8");
  const result = response("item-3", "9");
  expect(result.rewards.newBadges).toEqual([
    { code: "reading-detective", label: "审题侦探" },
    { code: "unit-inspector", label: "单位检查员" },
  ]);
  expect(response("item-3", "9").rewards).toEqual(result.rewards);
  expect(db.select().from(rewardEvents).where(eq(rewardEvents.code, "reading-detective")).all()).toHaveLength(1);
});
