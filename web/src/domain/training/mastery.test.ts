import { nextMasteryEvidence } from "./mastery";

test("requires repeated correct evidence before basic mastery", () => {
  expect(nextMasteryEvidence({ evidenceCount: 0, correctCount: 0 }, true))
    .toEqual({ evidenceCount: 1, correctCount: 1, status: "learning" });
  expect(nextMasteryEvidence({ evidenceCount: 1, correctCount: 1 }, true))
    .toEqual({ evidenceCount: 2, correctCount: 2, status: "basic" });
});

test("an incorrect answer keeps the skill in support", () => {
  expect(nextMasteryEvidence({ evidenceCount: 1, correctCount: 1 }, false).status)
    .toBe("needs_support");
});
