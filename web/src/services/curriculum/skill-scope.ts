import { eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { academicCalendar, childSkillSettings, skills } from "@/db/schema";
import type { EditionCode, OverrideMode } from "@/domain/curriculum/types";
import { currentSchoolYear } from "@/domain/curriculum/academic-calendar";
import { autoAvailable, effectiveEnabled, resolveAcademicCalendar } from "@/domain/curriculum/skill-availability";

export type SkillScopeRow = {
  skillId: string;
  code: string;
  name: string;
  grade: number;
  semester: 1 | 2;
  expectedWeek: number;
  mode: OverrideMode;
  autoAvailable: boolean;
  enabled: boolean;
};

export function listChildSkillScope(
  db: AppDatabase,
  child: { id: string; grade: number; edition: EditionCode },
  now: Date = new Date(),
): SkillScopeRow[] {
  const calRow = db.select()
    .from(academicCalendar)
    .where(eq(academicCalendar.schoolYear, currentSchoolYear(now)))
    .get();

  const context = resolveAcademicCalendar(calRow ?? undefined, now);

  const overrides = new Map<string, OverrideMode>();
  const settingsRows = db.select({ skillId: childSkillSettings.skillId, mode: childSkillSettings.mode })
    .from(childSkillSettings)
    .where(eq(childSkillSettings.childId, child.id))
    .all();
  for (const row of settingsRows) {
    overrides.set(row.skillId, row.mode as OverrideMode);
  }

  const allSkills = db.select({
    id: skills.id,
    code: skills.code,
    name: skills.name,
    grade: skills.grade,
    semester: skills.semester,
    expectedWeek: skills.expectedWeek,
  })
    .from(skills)
    .all();

  return allSkills.map((skill) => {
    const schedule = { grade: skill.grade, semester: skill.semester as 1 | 2, expectedWeek: skill.expectedWeek };
    const auto = autoAvailable(schedule, { id: child.id, grade: child.grade, edition: child.edition }, context);
    const mode: OverrideMode = overrides.get(skill.id) ?? "auto";
    return {
      skillId: skill.id,
      code: skill.code,
      name: skill.name,
      grade: skill.grade,
      semester: skill.semester as 1 | 2,
      expectedWeek: skill.expectedWeek,
      mode,
      autoAvailable: auto,
      enabled: effectiveEnabled(mode, auto),
    };
  });
}
