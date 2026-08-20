import type { AnswerSpec } from "@/domain/questions/answer-spec";
import { classifyError, errorCategory } from "./classify-error";

function question(answerSpec: AnswerSpec, overrides: Record<string, unknown> = {}) {
  return { answerSpec, stem: "", structureTag: "arithmetic", commonErrors: [], ...overrides };
}

test("classifies unit, range, and equation errors in deterministic priority order", () => {
  expect(classifyError(question(
    { kind: "number", value: 7.5, tolerance: 0, unit: "元" },
  ), "7.5")).toBe("missing_unit");
  expect(classifyError(question(
    { kind: "number", value: 7.5, tolerance: 0, unit: "元" },
  ), "7.5 米")).toBe("missing_unit");
  expect(classifyError(question(
    { kind: "number", value: 32, tolerance: 0, unit: null },
  ), "320")).toBe("range_check");
  expect(classifyError(question(
    { kind: "number", value: 7, tolerance: 0, unit: null },
    { stem: "3x + 5 = 26，x 等于多少？", structureTag: "equation-two-step" },
  ), "6")).toBe("relationship");
});

test("handles Chinese spacing and tolerance without inventing a 10x anomaly", () => {
  expect(classifyError(question(
    { kind: "number", value: 3.2, tolerance: 0.05, unit: "厘米" },
  ), "３．２　厘米")).toBe("unknown");
  expect(classifyError(question(
    { kind: "number", value: 3.2, tolerance: 30, unit: null },
  ), "32")).toBe("unknown");
});

test("uses only declared snapshot patterns and otherwise fails closed to unknown", () => {
  expect(classifyError(question(
    { kind: "number", value: 18, tolerance: 0, unit: null },
    { stem: "每盒 6 支，买 3 盒共多少支？", commonErrors: ["copied_number"] },
  ), "6")).toBe("copied_number");
  expect(classifyError(question(
    { kind: "number", value: 18, tolerance: 0, unit: null },
    { stem: "每盒 6 支，买 3 盒共多少支？", commonErrors: ["calculation"] },
  ), "17")).toBe("calculation");
  expect(classifyError(question(
    { kind: "choice", value: "C" },
    { commonErrors: ["incomplete_reading"], incompleteReadingTargets: ["A"] },
  ), "A")).toBe("incomplete_reading");
  expect(classifyError(question(
    { kind: "number", value: 18, tolerance: 0, unit: null },
    { commonErrors: ["copied_number"] },
  ), "17")).toBe("unknown");
  expect(classifyError(question(
    { kind: "number", value: 18, tolerance: 0, unit: null },
  ), "无法判断")).toBe("unknown");
});

test("maps causes to report categories explicitly", () => {
  expect(errorCategory("missing_unit")).toBe("habit");
  expect(errorCategory("relationship")).toBe("knowledge");
  expect(errorCategory("unknown")).toBe("unknown");
  expect(errorCategory("calculation")).toBe("habit");
});
