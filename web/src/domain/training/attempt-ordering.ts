type OrderedAttempt = {
  id: string;
  submittedAt: number;
  correctionNumber: number | null;
};

function byTimeAndId<T extends OrderedAttempt>(left: T, right: T) {
  return left.submittedAt - right.submittedAt || left.id.localeCompare(right.id);
}

export function firstAttempt<T extends OrderedAttempt>(rows: readonly T[]): T | null {
  const numberedFirst = rows.filter((row) => row.correctionNumber === 0).sort(byTimeAndId)[0];
  if (numberedFirst) return numberedFirst;
  const legacyFirst = rows.filter((row) => row.correctionNumber === null).sort(byTimeAndId)[0];
  if (legacyFirst) return legacyFirst;
  return [...rows].sort((left, right) => (
    (left.correctionNumber ?? Number.MAX_SAFE_INTEGER)
      - (right.correctionNumber ?? Number.MAX_SAFE_INTEGER)
    || byTimeAndId(left, right)
  ))[0] ?? null;
}

export function firstCorrectCorrection<T extends OrderedAttempt & { isCorrect: boolean }>(
  rows: readonly T[],
): T | null {
  const numbered = rows.filter((row) => row.isCorrect
    && row.correctionNumber !== null && row.correctionNumber > 0)
    .sort((left, right) => left.correctionNumber! - right.correctionNumber!
      || byTimeAndId(left, right))[0];
  if (numbered) return numbered;
  const first = firstAttempt(rows);
  return rows.filter((row) => row.isCorrect && row.correctionNumber === null && row.id !== first?.id)
    .sort(byTimeAndId)[0] ?? null;
}

export function compareAttempts<T extends OrderedAttempt & { sessionItemId: string }>(left: T, right: T) {
  const byTime = left.submittedAt - right.submittedAt;
  if (byTime !== 0 || left.sessionItemId !== right.sessionItemId) {
    return byTime || left.id.localeCompare(right.id);
  }
  const rank = (value: number | null) => value === null ? 0.5 : value;
  return rank(left.correctionNumber) - rank(right.correctionNumber) || left.id.localeCompare(right.id);
}
