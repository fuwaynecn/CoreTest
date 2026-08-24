import { expect, test } from "vitest";
import { allocateComposition } from "./allocate-composition";
import { selectDailyItems, type ScheduledCandidate } from "./select-daily-items";

const candidates: ScheduledCandidate[] = [
  { templateId: "overdue", skillId: "review-skill", structureTag: "review-a", category: "review", difficulty: 1, estimatedSeconds: 60, dueOn: "2026-08-18" },
  { templateId: "review-two", skillId: "review-skill", structureTag: "review-b", category: "review", difficulty: 1, estimatedSeconds: 60, dueOn: "2026-08-20" },
  { templateId: "review-three", skillId: "review-skill", structureTag: "review-c", category: "review", difficulty: 1, estimatedSeconds: 60, dueOn: "2026-08-20" },
  { templateId: "weak-a", skillId: "weak", structureTag: "weak-a", category: "weakness", difficulty: 1, estimatedSeconds: 60, dueOn: null },
  { templateId: "weak-b", skillId: "weak", structureTag: "weak-b", category: "weakness", difficulty: 1, estimatedSeconds: 60, dueOn: null },
  { templateId: "weak-c", skillId: "weak-other", structureTag: "weak-c", category: "weakness", difficulty: 1, estimatedSeconds: 60, dueOn: null },
  { templateId: "reading", skillId: "reading", structureTag: "read", category: "reading", difficulty: 1, estimatedSeconds: 60, dueOn: null },
  { templateId: "extension", skillId: "extension", structureTag: "extend", category: "extension", difficulty: 1, estimatedSeconds: 60, dueOn: null },
];

test("allocates composition with largest remainders and specialist focus", () => {
  expect(allocateComposition(20, "none")).toEqual({ weakness: 9, review: 5, reading: 4, extension: 2 });
  expect(allocateComposition(20, "reading")).toEqual({ weakness: 7, review: 5, reading: 7, extension: 1 });
});

test("reallocates an unavailable review slot to weakness before shortening", () => {
  const result = selectDailyItems({ candidates, targetSeconds: 600, composition: { weakness: 1, review: 3, reading: 0, extension: 0 }, date: "2026-08-20", seed: "day" });
  expect(result.items.filter((item) => item.category === "weakness")).toHaveLength(2);
  expect(result.shortages).toEqual(expect.objectContaining({ review: 1 }));
});

test("selects overdue reviews first without repeats and reports shortages", () => {
  const result = selectDailyItems({ candidates, targetSeconds: 300, composition: { weakness: 2, review: 3, reading: 1, extension: 1 }, date: "2026-08-20", seed: "day" });
  expect(result.items[0]).toMatchObject({ templateId: "overdue", category: "review", position: 0, variantSeed: "day:1:overdue" });
  expect(result.items.filter((item) => item.skillId === "review-skill")).toHaveLength(2);
  expect(new Set(result.items.map((item) => item.templateId)).size).toBe(result.items.length);
  expect(result.items.reduce((total, item) => total + item.estimatedSeconds, 0)).toBeLessThanOrEqual(360);
  expect(result.shortages).toEqual(expect.objectContaining({ review: 1 }));
});
