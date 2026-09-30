import type { EditionCode, SkillSchedule } from "./types";

// 扩展点：未来接入 skill_edition_overrides 时，在此函数内查覆盖行，
// 有覆盖返回覆盖值，无覆盖返回 skill 基线；调用方无需改动。
export function resolveSkillSchedule(skill: SkillSchedule, _edition: EditionCode): SkillSchedule {
  return { grade: skill.grade, semester: skill.semester, expectedWeek: skill.expectedWeek };
}
