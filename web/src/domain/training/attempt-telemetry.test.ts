import { normalizeTelemetry } from "./attempt-telemetry";

test("clamps negative and oversized telemetry to the allowed ranges", () => {
  expect(normalizeTelemetry({ activeDurationMs: -1, hintLevel: 9, hintCount: 99 }))
    .toEqual({ activeDurationMs: 0, hintLevel: 3, hintCount: 3 });
  expect(normalizeTelemetry({ activeDurationMs: 999_999, hintLevel: 0, hintCount: 0 }, 120))
    .toEqual({ activeDurationMs: 480_000, hintLevel: 0, hintCount: 0 });
});

test("truncates fractional telemetry before applying bounds", () => {
  expect(normalizeTelemetry({ activeDurationMs: 12.9, hintLevel: 1.9, hintCount: 2.9 }, 60))
    .toEqual({ activeDurationMs: 12, hintLevel: 1, hintCount: 2 });
});
