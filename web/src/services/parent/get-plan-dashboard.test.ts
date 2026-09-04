import { expect, test } from "vitest";
import { phase2Catalog, phase2Skills } from "@/content/phase2-catalog";
import { createTestDatabase } from "@/test/test-db";
import { diagnosticRuns, learningPlans, parentPreferences, questionInstances, questionTemplates, skills, users } from "@/db/schema";
import { getPlanDashboard } from "./get-plan-dashboard";

test("returns six weeks and a non-persisting seven-day rest preview", () => {
  const db = createTestDatabase();
  db.insert(users).values({ id: "child", role: "child", displayName: "孩子", credentialHash: "hash", createdAt: 1 }).run();
  db.insert(diagnosticRuns).values({ id: "diagnosis", childId: "child", version: 1, status: "completed", currentPart: 3, seed: "seed", startedAt: 1, completedAt: 2 }).run();
  db.insert(learningPlans).values({ id: "plan", childId: "child", diagnosisRunId: "diagnosis", version: 1, revision: 2, status: "active", startsOn: "2026-08-24", endsOn: "2026-10-04", reasonSnapshot: "{}", createdAt: 1 }).run();
  db.insert(parentPreferences).values({ childId: "child", trainingWeekdays: "[1,2,3,4,6]", targetMinutes: 30, specialistFocus: "equation", updatedAt: 1 }).run();
  const before = db.select().from(learningPlans).all().length;
  const view = getPlanDashboard(db, "child", new Date("2026-08-24T04:00:00Z"));
  expect(view.plan).toMatchObject({ version: 1, revision: 2, currentWeek: 1 });
  expect(view.plan?.weeks).toHaveLength(6);
  expect(view.nextSevenDays).toHaveLength(7);
  expect(view.nextSevenDays.find((day) => day.date === "2026-08-28")?.kind).toBe("rest");
  expect(db.select().from(learningPlans).all()).toHaveLength(before);
});

test("previews only active persistent question instances", () => {
  const db = createTestDatabase();
  db.insert(users).values({ id: "child", role: "child", displayName: "孩子", credentialHash: "hash", createdAt: 1 }).run();
  db.insert(skills).values(phase2Skills).run();
  const template = phase2Catalog[0];
  db.insert(questionTemplates).values({ id: template.id, skillId: `skill-${template.skillCode}`, domain: template.domain, contentTier: template.contentTier, structureTag: template.structureTag, estimatedSeconds: template.estimatedSeconds, readingLoad: template.readingLoad, answerMode: template.answerMode, variantSpec: JSON.stringify(template.variantSpec), hintLadder: JSON.stringify(template.hintLadder), commonErrors: JSON.stringify(template.commonErrors), readingCard: template.readingCard, source: template.source, licenseStatus: template.licenseStatus, stem: template.stemPattern, answerSpec: JSON.stringify(template.answerSpecPattern), explanation: template.explanationPattern, difficulty: template.difficulty, active: true }).run();
  db.insert(diagnosticRuns).values({ id: "diagnosis", childId: "child", version: 1, status: "completed", currentPart: 3, seed: "seed", startedAt: 1, completedAt: 2 }).run();
  db.insert(learningPlans).values({ id: "plan", childId: "child", diagnosisRunId: "diagnosis", version: 1, revision: 1, status: "active", startsOn: "2026-08-24", endsOn: "2026-10-04", reasonSnapshot: "{}", createdAt: 1 }).run();
  db.insert(parentPreferences).values({ childId: "child", trainingWeekdays: "[1,2,3,4,5]", targetMinutes: 30, specialistFocus: "none", updatedAt: 1 }).run();

  expect(getPlanDashboard(db, "child", new Date("2026-08-24T04:00:00Z")).nextSevenDays[0].items).toEqual([]);
  db.insert(questionInstances).values({ id: "active-instance", templateId: template.id, skillId: `skill-${template.skillCode}`, variantSeed: "seed", variables: "{}", stem: "持久化题目", answerSpec: JSON.stringify({ kind: "number", value: 1, tolerance: 0, unit: null }), explanation: "解释", difficulty: template.difficulty, fingerprint: "active-fingerprint", active: true, generatedAt: 1, updatedAt: 1, lastUsedAt: 100 }).run();
  expect(getPlanDashboard(db, "child", new Date("2026-08-24T04:00:00Z")).nextSevenDays[0].items).toHaveLength(1);
});
