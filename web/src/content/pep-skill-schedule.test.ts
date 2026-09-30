import { phase1DailySkills } from "./phase1-daily";
import { phase2Skills } from "./phase2-catalog";
import { pepSkillSchedule } from "./pep-skill-schedule";

describe("pepSkillSchedule", () => {
  const codes = new Set([
    ...phase2Skills.map((skill) => skill.code),
    ...phase1DailySkills.map((skill) => skill.code),
  ]);

  it("每个现有知识点都有且仅有一条合法进度", () => {
    for (const code of codes) {
      const entry = pepSkillSchedule[code];
      expect(entry, `missing ${code}`).toBeDefined();
      expect(entry.grade).toBeGreaterThanOrEqual(1);
      expect(entry.grade).toBeLessThanOrEqual(6);
      expect([1, 2]).toContain(entry.semester);
      expect(entry.expectedWeek).toBeGreaterThanOrEqual(1);
      expect(entry.expectedWeek).toBeLessThanOrEqual(20);
    }
  });

  it("没有多余代码", () => {
    expect(new Set(Object.keys(pepSkillSchedule))).toEqual(codes);
  });
});
