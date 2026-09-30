import { resolveSkillSchedule } from "./resolve-schedule";
import type { ChildProfile, OverrideMode, SkillSchedule } from "./types";

export type CalendarRow = {
  schoolYear: string;
  semester1Start: string;
  semester2Start: string;
};

export const DEFAULT_CALENDAR: CalendarRow = {
  schoolYear: "2026-2027",
  semester1Start: "2026-09-01",
  semester2Start: "2027-02-22",
};

export {
  currentSchoolYear,
  resolveAcademicCalendar,
  type AcademicPhase,
} from "./academic-calendar";

export type CalendarContext = ReturnType<typeof import("./academic-calendar").resolveAcademicCalendar>;

export function autoAvailable(
  schedule: SkillSchedule,
  child: ChildProfile,
  context: CalendarContext,
): boolean {
  const resolved = resolveSkillSchedule(schedule, child.edition);

  if (resolved.grade < child.grade) return true;
  if (resolved.grade > child.grade) return false;

  if (context.phase === "summer") return true;
  if (context.phase === "semester1") {
    return resolved.semester === 1 && context.weeksIntoTerm >= resolved.expectedWeek;
  }
  // semester2：上册内容已学完恒解锁；下册按周序。
  return resolved.semester === 1 || context.weeksIntoTerm >= resolved.expectedWeek;
}

export function effectiveEnabled(mode: OverrideMode, auto: boolean): boolean {
  if (mode === "off") return false;
  if (mode === "on") return true;
  return auto;
}
