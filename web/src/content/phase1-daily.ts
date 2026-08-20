import type { ErrorCause, LearningDomain } from "@/domain/learning/contracts";
import type { AnswerSpec } from "@/domain/questions/answer-spec";

export const phase1DailySkills = [
  { id: "skill-decimal", code: "decimal", name: "小数计算", domain: "数与运算" },
  { id: "skill-reading", code: "reading", name: "读题与单位", domain: "数学思维与学习习惯" },
  { id: "skill-equation", code: "equation", name: "一步方程", domain: "方程与代数意识" },
] as const;

type Phase1DailyTemplate = {
  id: string;
  skillId: string;
  domain: LearningDomain;
  contentTier: "core";
  structureTag: string;
  estimatedSeconds: number;
  readingLoad: "short" | "medium";
  answerMode: "written";
  commonErrors: readonly ErrorCause[];
  hintLadder: readonly [string, string, string];
  readingCard: boolean;
  source: "original";
  licenseStatus: "owned";
  stem: string;
  answerSpec: AnswerSpec;
  explanation: string;
  difficulty: 1 | 2;
};

export const phase1DailyTemplates = [
  {
    id: "q-decimal-1",
    skillId: "skill-decimal",
    domain: "number_operations",
    contentTier: "core",
    structureTag: "decimal-add",
    estimatedSeconds: 60,
    readingLoad: "short",
    answerMode: "written",
    commonErrors: ["calculation"],
    hintLadder: ["先看小数位。", "把相同数位对齐。", "逐位相加并检查小数点。"],
    readingCard: false,
    source: "original",
    licenseStatus: "owned",
    stem: "3.6 + 2.4 = ?",
    answerSpec: { kind: "number", value: 6, tolerance: 0, unit: null },
    explanation: "把十分位对齐相加，结果是 6。",
    difficulty: 1,
  },
  {
    id: "q-reading-1",
    skillId: "skill-reading",
    domain: "thinking_habits",
    contentTier: "core",
    structureTag: "read-target-unit",
    estimatedSeconds: 75,
    readingLoad: "medium",
    answerMode: "written",
    commonErrors: ["missing_unit", "incomplete_reading"],
    hintLadder: ["先圈出问题问什么。", "找出价格和数量，并留意单位。", "用单价乘数量，答案写‘元’。"],
    readingCard: true,
    source: "original",
    licenseStatus: "owned",
    stem: "每盒彩笔 7.5 元，买 1 盒需要付多少钱？请写单位。",
    answerSpec: { kind: "number", value: 7.5, tolerance: 0, unit: "元" },
    explanation: "问题问付多少钱，因此答案必须带单位‘元’。",
    difficulty: 1,
  },
  {
    id: "q-equation-1",
    skillId: "skill-equation",
    domain: "equation_algebra",
    contentTier: "core",
    structureTag: "equation-two-step",
    estimatedSeconds: 90,
    readingLoad: "short",
    answerMode: "written",
    commonErrors: ["relationship", "calculation"],
    hintLadder: ["想想怎样让 x 单独留下。", "等式两边先同时减去 5。", "得到 3x=21 后，两边再同时除以 3。"],
    readingCard: false,
    source: "original",
    licenseStatus: "owned",
    stem: "3x + 5 = 26，x 等于多少？",
    answerSpec: { kind: "number", value: 7, tolerance: 0, unit: null },
    explanation: "先从等式两边都减去 5，再把两边都除以 3。",
    difficulty: 2,
  },
] as const satisfies readonly Phase1DailyTemplate[];

export const phase1DailyTemplateIds = phase1DailyTemplates.map(({ id }) => id);
