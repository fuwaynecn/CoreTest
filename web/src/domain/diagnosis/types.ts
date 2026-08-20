import type { LearningDomain, MasteryStatus } from "@/domain/learning/contracts";

export type Difficulty = 1 | 2 | 3 | 4;

export type DiagnosticAnswer = {
  templateId: string;
  skillId: string;
  domain: LearningDomain;
  difficulty: Difficulty;
  correct: boolean;
  independent: boolean;
};

export type DiagnosticTemplateSummary = {
  templateId: string;
  skillId: string;
  domain: LearningDomain;
  difficulty: Difficulty;
};

export type DiagnosticSelection = {
  templateId: string;
  variantSeed: string;
  difficulty: Difficulty;
  reason: "part_anchor" | "raise_after_two" | "lower_after_error" | "hold_level";
};

export type DiagnosticPartNumber = 1 | 2 | 3;

export type DiagnosticSelectionInput = {
  catalog: readonly DiagnosticTemplateSummary[];
  answers: readonly DiagnosticAnswer[];
  runSeed: string;
  partNumber: DiagnosticPartNumber;
};

export type InitialDiagnosisStatus = Extract<MasteryStatus, "needs_support" | "learning" | "basic">;

export type InitialDiagnosisResult = {
  status: InitialDiagnosisStatus;
  weightedRate: number;
  evidenceCount: number;
  distinctIndependentCorrectTemplates: number;
};

export type InitialDiagnosisSkillResult = InitialDiagnosisResult & {
  skillId: string;
  domain: LearningDomain;
};

export type InitialDiagnosisDomainResult = InitialDiagnosisResult & {
  domain: LearningDomain;
};

export type InitialDiagnosisReport = {
  skills: InitialDiagnosisSkillResult[];
  domains: InitialDiagnosisDomainResult[];
};
