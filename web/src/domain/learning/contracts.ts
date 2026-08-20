export const learningDomains = [
  "number_operations", "equation_algebra", "geometry_space",
  "data_statistics", "application_modeling", "thinking_habits",
] as const;

export type LearningDomain = typeof learningDomains[number];
export type ContentTier = "core" | "regional" | "transition";
export type SessionKind = "diagnostic" | "practice" | "daily" | "review" | "assessment";
export type MasteryStatus = "undiagnosed" | "needs_support" | "learning" | "basic" | "stable";
export type ErrorCause = "missing_unit" | "copied_number" | "calculation" | "relationship"
  | "range_check" | "incomplete_reading" | "unknown";
