export type AttemptTelemetry = {
  activeDurationMs: number;
  hintLevel: 0 | 1 | 2 | 3;
  hintCount: number;
};

type AttemptTelemetryInput = {
  activeDurationMs: number;
  hintLevel: number;
  hintCount: number;
};

function boundedInteger(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(Math.max(Math.trunc(value), minimum), maximum);
}

export function normalizeTelemetry(
  input: AttemptTelemetryInput,
  estimatedSeconds: unknown = 300,
): AttemptTelemetry {
  const safeEstimatedSeconds = typeof estimatedSeconds === "number" && Number.isFinite(estimatedSeconds)
    ? Math.max(0, Math.trunc(estimatedSeconds))
    : 300;
  const durationMaximum = safeEstimatedSeconds * 4_000;
  return {
    activeDurationMs: boundedInteger(input.activeDurationMs, 0, durationMaximum),
    hintLevel: boundedInteger(input.hintLevel, 0, 3) as AttemptTelemetry["hintLevel"],
    hintCount: boundedInteger(input.hintCount, 0, 3),
  };
}
