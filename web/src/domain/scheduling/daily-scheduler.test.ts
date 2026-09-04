import { expect, test } from "vitest";
import { allocateComposition } from "./allocate-composition";
import { selectDailyItems, type ScheduledCandidate } from "./select-daily-items";

const candidates: ScheduledCandidate[] = [
  { templateId: "overdue", questionInstanceId: "overdue", lastUsedAt: null, skillId: "review-skill", structureTag: "review-a", category: "review", difficulty: 1, estimatedSeconds: 60, dueOn: "2026-08-18" },
  { templateId: "review-two", questionInstanceId: "review-two", lastUsedAt: null, skillId: "review-skill", structureTag: "review-b", category: "review", difficulty: 1, estimatedSeconds: 60, dueOn: "2026-08-20" },
  { templateId: "review-three", questionInstanceId: "review-three", lastUsedAt: null, skillId: "review-skill", structureTag: "review-c", category: "review", difficulty: 1, estimatedSeconds: 60, dueOn: "2026-08-20" },
  { templateId: "weak-a", questionInstanceId: "weak-a", lastUsedAt: null, skillId: "weak", structureTag: "weak-a", category: "weakness", difficulty: 1, estimatedSeconds: 60, dueOn: null },
  { templateId: "weak-b", questionInstanceId: "weak-b", lastUsedAt: null, skillId: "weak", structureTag: "weak-b", category: "weakness", difficulty: 1, estimatedSeconds: 60, dueOn: null },
  { templateId: "weak-c", questionInstanceId: "weak-c", lastUsedAt: null, skillId: "weak-other", structureTag: "weak-c", category: "weakness", difficulty: 1, estimatedSeconds: 60, dueOn: null },
  { templateId: "reading", questionInstanceId: "reading", lastUsedAt: null, skillId: "reading", structureTag: "read", category: "reading", difficulty: 1, estimatedSeconds: 60, dueOn: null },
  { templateId: "extension", questionInstanceId: "extension", lastUsedAt: null, skillId: "extension", structureTag: "extend", category: "extension", difficulty: 1, estimatedSeconds: 60, dueOn: null },
];

test("allocates composition with largest remainders and specialist focus", () => {
  expect(allocateComposition(20, "none")).toEqual({ weakness: 9, review: 5, reading: 4, extension: 2 });
  expect(allocateComposition(20, "reading")).toEqual({ weakness: 7, review: 5, reading: 7, extension: 1 });
  expect(allocateComposition(20, "computation")).toEqual({ weakness: 12, review: 5, reading: 2, extension: 1 });
  expect(allocateComposition(20, "equation")).toEqual({ weakness: 12, review: 5, reading: 2, extension: 1 });
  expect(allocateComposition(4, "none")).toEqual({ weakness: 2, review: 1, reading: 1, extension: 0 });
});

test("reallocates an unavailable review slot to weakness before shortening", () => {
  const result = selectDailyItems({ candidates, targetSeconds: 600, composition: { weakness: 1, review: 3, reading: 0, extension: 0 }, date: "2026-08-20", seed: "day" });
  expect(result.items.filter((item) => item.category === "weakness")).toHaveLength(2);
  expect(result.shortages).toEqual(expect.objectContaining({ review: 1 }));
});

test("fills remaining slots from available categories when a composition is short", () => {
  const result = selectDailyItems({
    candidates: candidates.slice(3),
    targetSeconds: 600,
    composition: { weakness: 5, review: 0, reading: 0, extension: 0 },
    date: "2026-08-20",
    seed: "supplemental",
  });
  expect(result.items).toHaveLength(5);
  expect(result.items.map((item) => item.category)).toEqual([
    "weakness", "weakness", "weakness", "reading", "extension",
  ]);
});

test("uses target difficulty after mastery rank when ordering candidates", () => {
  const result = selectDailyItems({ candidates: [
    { templateId: "far", questionInstanceId: "far", lastUsedAt: null, skillId: "one", structureTag: "one", category: "weakness", difficulty: 4, targetDifficulty: 2, estimatedSeconds: 60, dueOn: null },
    { templateId: "near", questionInstanceId: "near", lastUsedAt: null, skillId: "two", structureTag: "two", category: "weakness", difficulty: 2, targetDifficulty: 2, estimatedSeconds: 60, dueOn: null },
  ], targetSeconds: 60, composition: { weakness: 1, review: 0, reading: 0, extension: 0 }, date: "2026-08-20", seed: "day" });
  expect(result.items[0].templateId).toBe("near");
});

test("caps one structure at six and permits only the final item beyond the duration target", () => {
  const sameStructure = Array.from({ length: 7 }, (_, index): ScheduledCandidate => ({ templateId: `same-${index}`, questionInstanceId: `same-${index}`, lastUsedAt: null, skillId: `skill-${index}`, structureTag: "same", category: "weakness", difficulty: 1, estimatedSeconds: 60, dueOn: null }));
  const capped = selectDailyItems({ candidates: sameStructure, targetSeconds: 1_000, composition: { weakness: 7, review: 0, reading: 0, extension: 0 }, date: "2026-08-20", seed: "day" });
  expect(capped.items).toHaveLength(6);
  const duration = selectDailyItems({ candidates: sameStructure.map((candidate, index) => ({ ...candidate, templateId: `duration-${index}`, structureTag: `duration-${index}` })), targetSeconds: 100, composition: { weakness: 3, review: 0, reading: 0, extension: 0 }, date: "2026-08-20", seed: "day" });
  expect(duration.items.reduce((total, item) => total + item.estimatedSeconds, 0)).toBe(120);
});

test("selects overdue reviews first without repeats and reports shortages", () => {
  const result = selectDailyItems({ candidates, targetSeconds: 300, composition: { weakness: 2, review: 3, reading: 1, extension: 1 }, date: "2026-08-20", seed: "day" });
  expect(result.items[0]).toMatchObject({ templateId: "overdue", category: "review", position: 0, variantSeed: "day:1:overdue" });
  expect(result.items.filter((item) => item.skillId === "review-skill")).toHaveLength(2);
  expect(new Set(result.items.map((item) => item.templateId)).size).toBe(result.items.length);
  expect(result.items.reduce((total, item) => total + item.estimatedSeconds, 0)).toBeLessThanOrEqual(360);
  expect(result.shortages).toEqual(expect.objectContaining({ review: 1 }));
});

test("prefers the least recently used persistent instance, including never-used rows", () => {
  const result = selectDailyItems({ candidates: [
    { templateId: "same-template", questionInstanceId: "used-later", lastUsedAt: 200, skillId: "weak", structureTag: "a", category: "weakness", difficulty: 1, estimatedSeconds: 60, dueOn: null },
    { templateId: "same-template", questionInstanceId: "never-b", lastUsedAt: null, skillId: "weak", structureTag: "d", category: "weakness", difficulty: 1, estimatedSeconds: 60, dueOn: null },
    { templateId: "same-template", questionInstanceId: "never-used", lastUsedAt: null, skillId: "weak", structureTag: "b", category: "weakness", difficulty: 1, estimatedSeconds: 60, dueOn: null },
    { templateId: "same-template", questionInstanceId: "used-earlier", lastUsedAt: 100, skillId: "weak", structureTag: "c", category: "weakness", difficulty: 1, estimatedSeconds: 60, dueOn: null },
    { templateId: "same-template", questionInstanceId: "never-a", lastUsedAt: null, skillId: "weak", structureTag: "e", category: "weakness", difficulty: 1, estimatedSeconds: 60, dueOn: null },
  ] as ScheduledCandidate[], composition: { weakness: 5, review: 0, reading: 0, extension: 0 }, targetSeconds: 600, date: "2026-08-20", seed: "day" });
  expect(result.items.map((item) => item.questionInstanceId)).toEqual(["never-a", "never-b", "never-used", "used-earlier", "used-later"]);
  expect(new Set(result.items.map((item) => item.questionInstanceId)).size).toBe(result.items.length);
});
