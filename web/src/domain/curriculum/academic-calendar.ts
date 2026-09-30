import type { CalendarRow } from "./skill-availability";

export type AcademicPhase = "semester1" | "semester2" | "summer";

const MS_PER_DAY = 86_400_000;

export function currentSchoolYear(now: Date): string {
  const year = now.getUTCFullYear();
  const startYear = now.getUTCMonth() >= 8 ? year : year - 1; // 9 月起新学年
  return `${startYear}-${startYear + 1}`;
}

function daysBetween(start: string, now: Date): number {
  return Math.floor((now.getTime() - Date.parse(`${start}T00:00:00Z`)) / MS_PER_DAY);
}

export function weeksElapsedSince(start: string, now: Date): number {
  return Math.floor(daysBetween(start, now) / 7);
}

export function resolveAcademicCalendar(
  row: CalendarRow | undefined,
  now: Date,
): { calendar: CalendarRow; usedDefault: boolean; phase: AcademicPhase; weeksIntoTerm: number } {
  const calendar = row ?? {
    schoolYear: "2026-2027",
    semester1Start: "2026-09-01",
    semester2Start: "2027-02-22",
  };

  const beforeSemester2 = now.getTime() < Date.parse(`${calendar.semester2Start}T00:00:00Z`);
  if (beforeSemester2) {
    return { calendar, usedDefault: !row, phase: "semester1", weeksIntoTerm: weeksElapsedSince(calendar.semester1Start, now) };
  }
  // 下学期结束按 19 教学周估算，之后至下一学年开学前为暑假。
  const semester2End = Date.parse(`${calendar.semester2Start}T00:00:00Z`) + 19 * 7 * MS_PER_DAY;
  if (now.getTime() < semester2End) {
    return { calendar, usedDefault: !row, phase: "semester2", weeksIntoTerm: weeksElapsedSince(calendar.semester2Start, now) };
  }
  return { calendar, usedDefault: !row, phase: "summer", weeksIntoTerm: 0 };
}
