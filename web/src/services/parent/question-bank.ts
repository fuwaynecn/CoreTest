import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { questionInstances, questionTemplates, sessionItems, skills, trainingSessions } from "@/db/schema";
import { answerSpecSchema, type AnswerSpec } from "@/domain/questions/answer-spec";
import type { LearningDomain, SessionKind } from "@/domain/learning/contracts";
import { renderedQuestionErrors } from "@/domain/questions/formal-template-validation";

export type QuestionBankFilters = {
  skillId?: string;
  domain?: LearningDomain;
  difficulty?: 1 | 2 | 3 | 4;
  status?: "active" | "inactive";
};

export type QuestionBankUsage = {
  sessionDate: string;
  sessionKind: SessionKind;
  count: number;
};

export type QuestionBankRow = {
  id: string;
  stem: string;
  answerSpec: AnswerSpec;
  explanation: string;
  skillId: string;
  skillCode: string;
  skillName: string;
  domain: LearningDomain;
  difficulty: 1 | 2 | 3 | 4;
  active: boolean;
  status: "active" | "inactive";
  templateId: string;
  templateName: string;
  structureTag: string;
  answerMode: "mental" | "written" | "choice" | "fill" | "expression" | "equation";
  generatedAt: number;
  updatedAt: number;
  lastUsedAt: number | null;
  usage: QuestionBankUsage[];
};

export type UpdateQuestionBankInput = {
  stem: string;
  answerSpec: AnswerSpec;
  explanation: string;
  skillId: string;
  difficulty: 1 | 2 | 3 | 4;
  active: boolean;
};

export class QuestionBankItemNotFoundError extends Error {
  constructor() { super("question_bank_item_not_found"); }
}

export type QuestionBankValidationField = "stem" | "answer" | "unit" | "skill" | "difficulty" | "explanation" | "form";
export type QuestionBankValidationReason = { code: string; field: QuestionBankValidationField };

const validationReasonFields: Record<string, QuestionBankValidationField> = {
  invalid_answer_spec: "answer",
  answer_mode_mismatch: "answer",
  incorrect_number_answer: "answer",
  incorrect_equation_answer: "answer",
  incorrect_choice_answer: "answer",
  missing_unit: "unit",
  unit_mismatch: "unit",
  unknown_skill: "skill",
  unsupported_number_pattern: "stem",
  invalid_number_pattern: "stem",
  unsolvable_equation: "stem",
  invalid_choice_options: "stem",
  duplicate_choice_option: "stem",
  unsupported_choice_pattern: "stem",
  invalid_choice_pattern: "stem",
};

export class QuestionBankValidationError extends Error {
  constructor(public readonly reasons: string[]) { super("question_bank_item_invalid"); }
}

export function questionBankValidationReasons(reasons: readonly string[]): QuestionBankValidationReason[] {
  const mapped = new Map<string, QuestionBankValidationReason>();
  for (const reason of reasons) {
    const field = validationReasonFields[reason] ?? "form";
    const code = validationReasonFields[reason] ? reason : "invalid_question";
    mapped.set(`${code}:${field}`, { code, field });
  }
  return [...mapped.values()];
}

type QuestionBankDb = Pick<AppDatabase, "select">;

function rowQuery(db: QuestionBankDb, id?: string) {
  const filters = id ? [eq(questionInstances.id, id)] : [];
  return db.select({
    id: questionInstances.id,
    stem: questionInstances.stem,
    answerSpec: questionInstances.answerSpec,
    explanation: questionInstances.explanation,
    skillId: questionInstances.skillId,
    skillCode: skills.code,
    skillName: skills.name,
    domain: skills.domain,
    difficulty: questionInstances.difficulty,
    active: questionInstances.active,
    templateId: questionTemplates.id,
    templateName: questionTemplates.stem,
    structureTag: questionTemplates.structureTag,
    answerMode: questionTemplates.answerMode,
    generatedAt: questionInstances.generatedAt,
    updatedAt: questionInstances.updatedAt,
    lastUsedAt: questionInstances.lastUsedAt,
  }).from(questionInstances)
    .innerJoin(questionTemplates, eq(questionInstances.templateId, questionTemplates.id))
    .innerJoin(skills, eq(questionInstances.skillId, skills.id))
    .where(filters.length ? and(...filters) : undefined);
}

function toRow(row: ReturnType<typeof rowQuery> extends { all: () => infer R } ? R extends Array<infer T> ? T : never : never): Omit<QuestionBankRow, "usage"> {
  const answerSpec = answerSpecSchema.parse(JSON.parse(row.answerSpec));
  return {
    ...row,
    answerSpec,
    domain: row.domain as LearningDomain,
    difficulty: row.difficulty as 1 | 2 | 3 | 4,
    status: row.active ? "active" : "inactive",
  };
}

export function listQuestionBank(db: AppDatabase, filters: QuestionBankFilters): QuestionBankRow[] {
  const conditions = [];
  if (filters.skillId) conditions.push(eq(questionInstances.skillId, filters.skillId));
  if (filters.domain) conditions.push(eq(skills.domain, filters.domain));
  if (filters.difficulty) conditions.push(eq(questionInstances.difficulty, filters.difficulty));
  if (filters.status) conditions.push(eq(questionInstances.active, filters.status === "active"));
  const query = db.select({
    id: questionInstances.id,
    stem: questionInstances.stem,
    answerSpec: questionInstances.answerSpec,
    explanation: questionInstances.explanation,
    skillId: questionInstances.skillId,
    skillCode: skills.code,
    skillName: skills.name,
    domain: skills.domain,
    difficulty: questionInstances.difficulty,
    active: questionInstances.active,
    templateId: questionTemplates.id,
    templateName: questionTemplates.stem,
    structureTag: questionTemplates.structureTag,
    answerMode: questionTemplates.answerMode,
    generatedAt: questionInstances.generatedAt,
    updatedAt: questionInstances.updatedAt,
    lastUsedAt: questionInstances.lastUsedAt,
  }).from(questionInstances)
    .innerJoin(questionTemplates, eq(questionInstances.templateId, questionTemplates.id))
    .innerJoin(skills, eq(questionInstances.skillId, skills.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(questionInstances.active), asc(skills.code), asc(questionInstances.difficulty), asc(questionInstances.stem), asc(questionInstances.id))
    .limit(100)
    .all();
  const usageByInstance = new Map<string, QuestionBankUsage[]>();
  if (query.length) {
    const usageRows = db.select({
      questionInstanceId: sessionItems.questionInstanceId,
      sessionDate: trainingSessions.sessionDate,
      sessionKind: trainingSessions.kind,
      count: count(sessionItems.id),
    }).from(sessionItems)
      .innerJoin(trainingSessions, eq(sessionItems.sessionId, trainingSessions.id))
      .where(inArray(sessionItems.questionInstanceId, query.map((row) => row.id)))
      .groupBy(sessionItems.questionInstanceId, trainingSessions.sessionDate, trainingSessions.kind)
      .orderBy(desc(trainingSessions.sessionDate), asc(trainingSessions.kind))
      .all();
    for (const usage of usageRows) {
      if (!usage.questionInstanceId) continue;
      const values = usageByInstance.get(usage.questionInstanceId) ?? [];
      if (values.length < 5) values.push({
        sessionDate: usage.sessionDate,
        sessionKind: usage.sessionKind as SessionKind,
        count: Number(usage.count),
      });
      usageByInstance.set(usage.questionInstanceId, values);
    }
  }
  return query.map((row) => ({ ...toRow(row), usage: usageByInstance.get(row.id) ?? [] }));
}

export function updateQuestionBankItem(db: AppDatabase, id: string, input: UpdateQuestionBankInput, now: Date | number): QuestionBankRow {
  const updatedAt = new Date(now).getTime();
  return db.transaction((tx) => {
    const current = rowQuery(tx, id).get();
    if (!current) throw new QuestionBankItemNotFoundError();
    const parsedAnswer = answerSpecSchema.safeParse(input.answerSpec);
    if (!parsedAnswer.success) throw new QuestionBankValidationError(["invalid_answer_spec"]);
    const skill = tx.select({ id: skills.id }).from(skills).where(eq(skills.id, input.skillId)).get();
    if (!skill) throw new QuestionBankValidationError(["unknown_skill"]);
    const errors = renderedQuestionErrors({ answerMode: current.answerMode, stem: input.stem, answerSpec: parsedAnswer.data });
    if (errors.length) throw new QuestionBankValidationError(errors);
    tx.update(questionInstances).set({
      stem: input.stem,
      answerSpec: JSON.stringify(parsedAnswer.data),
      explanation: input.explanation,
      skillId: input.skillId,
      difficulty: input.difficulty,
      active: input.active,
      updatedAt,
    }).where(eq(questionInstances.id, id)).run();
    return { ...toRow(rowQuery(tx, id).get()!), usage: [] };
  });
}
