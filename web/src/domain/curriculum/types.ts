export const editionCodes = ["pep"] as const;
export type EditionCode = (typeof editionCodes)[number];

export const overrideModes = ["auto", "on", "off"] as const;
export type OverrideMode = (typeof overrideModes)[number];

export type SkillSchedule = {
  grade: number;
  semester: 1 | 2;
  expectedWeek: number;
};

export type ChildProfile = {
  id: string;
  grade: number;
  edition: EditionCode;
};
