import { resolveSkillSchedule } from "./resolve-schedule";

describe("resolveSkillSchedule", () => {
  const schedule = { grade: 5, semester: 1, expectedWeek: 10 } as const;

  it("pep 版本直接返回知识点自身进度", () => {
    expect(resolveSkillSchedule(schedule, "pep")).toEqual({ ...schedule });
  });

  it("返回新对象，调用方修改不影响原值", () => {
    const resolved = resolveSkillSchedule(schedule, "pep");
    resolved.grade = 99;
    expect(schedule.grade).toBe(5);
  });
});
