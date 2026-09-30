import {
  DEFAULT_CALENDAR, autoAvailable, currentSchoolYear,
  effectiveEnabled, resolveAcademicCalendar,
} from "./skill-availability";
import type { ChildProfile } from "./types";

const child: ChildProfile = { id: "c1", grade: 5, edition: "pep" };

describe("currentSchoolYear", () => {
  it("8-12 月归本学年，1-7 月归上学年", () => {
    expect(currentSchoolYear(new Date("2026-10-01T00:00:00Z"))).toBe("2026-2027");
    expect(currentSchoolYear(new Date("2027-01-15T00:00:00Z"))).toBe("2026-2027");
    expect(currentSchoolYear(new Date("2027-08-31T00:00:00Z"))).toBe("2026-2027");
    expect(currentSchoolYear(new Date("2027-09-01T00:00:00Z"))).toBe("2027-2028");
  });
});

describe("resolveAcademicCalendar", () => {
  it("缺行用默认并标记 usedDefault", () => {
    const result = resolveAcademicCalendar(undefined, new Date("2026-10-01"));
    expect(result.usedDefault).toBe(true);
    expect(result.calendar.schoolYear).toBe(DEFAULT_CALENDAR.schoolYear);
    expect(result.phase).toBe("semester1");
  });

  it("开学 28 天为第 4 周", () => {
    const result = resolveAcademicCalendar(undefined, new Date("2026-09-29"));
    expect(result.weeksIntoTerm).toBe(4);
  });

  it("3 月进入下学期，8 月为暑假", () => {
    const row = { schoolYear: "2026-2027", semester1Start: "2026-09-01", semester2Start: "2027-02-22" };
    expect(resolveAcademicCalendar(row, new Date("2027-03-01")).phase).toBe("semester2");
    expect(resolveAcademicCalendar(row, new Date("2027-08-01")).phase).toBe("summer");
  });
});

describe("autoAvailable", () => {
  const ctx = resolveAcademicCalendar(undefined, new Date("2026-09-29")); // week 4 of s1

  it("低年级恒解锁、高年级恒锁定", () => {
    expect(autoAvailable({ grade: 4, semester: 2, expectedWeek: 20 }, child, ctx)).toBe(true);
    expect(autoAvailable({ grade: 6, semester: 1, expectedWeek: 1 }, child, ctx)).toBe(false);
  });

  it("同年级上册按周序解锁", () => {
    expect(autoAvailable({ grade: 5, semester: 1, expectedWeek: 4 }, child, ctx)).toBe(true);
    expect(autoAvailable({ grade: 5, semester: 1, expectedWeek: 5 }, child, ctx)).toBe(false);
  });

  it("同年级下册在上学期期间锁定", () => {
    expect(autoAvailable({ grade: 5, semester: 2, expectedWeek: 1 }, child, ctx)).toBe(false);
  });

  it("暑假期间同年级全部解锁", () => {
    const summer = resolveAcademicCalendar(undefined, new Date("2027-08-01"));
    expect(autoAvailable({ grade: 5, semester: 2, expectedWeek: 20 }, child, summer)).toBe(true);
  });
});

describe("effectiveEnabled", () => {
  it("off 恒关、on 恒开、auto 跟随", () => {
    expect(effectiveEnabled("off", true)).toBe(false);
    expect(effectiveEnabled("on", false)).toBe(true);
    expect(effectiveEnabled("auto", true)).toBe(true);
    expect(effectiveEnabled("auto", false)).toBe(false);
  });
});
