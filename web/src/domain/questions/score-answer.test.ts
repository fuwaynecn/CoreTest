import { scoreAnswer } from "./score-answer";

test("accepts an equivalent decimal and required unit", () => {
  expect(scoreAnswer("7.50 元", { kind: "number", value: 7.5, tolerance: 0, unit: "元" }))
    .toEqual({ correct: true, normalizedAnswer: "7.5 元" });
});

test("rejects a missing required unit", () => {
  expect(scoreAnswer("7.5", { kind: "number", value: 7.5, tolerance: 0, unit: "元" }).correct)
    .toBe(false);
});

test("scores a choice without fuzzy matching", () => {
  expect(scoreAnswer("B", { kind: "choice", value: "B" }).correct).toBe(true);
  expect(scoreAnswer("b.", { kind: "choice", value: "B" }).correct).toBe(false);
});
