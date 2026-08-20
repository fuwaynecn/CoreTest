import { sql } from "drizzle-orm";
import { integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  role: text("role", { enum: ["parent", "child"] }).notNull(),
  displayName: text("display_name").notNull(),
  credentialHash: text("credential_hash").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const authSessions = sqliteTable("auth_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: integer("expires_at").notNull(),
}, (table) => [uniqueIndex("auth_sessions_token_hash_idx").on(table.tokenHash)]);

export const skills = sqliteTable("skills", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  domain: text("domain").notNull(),
});

export const questionTemplates = sqliteTable("question_templates", {
  id: text("id").primaryKey(),
  skillId: text("skill_id").notNull().references(() => skills.id),
  domain: text("domain", { enum: [
    "number_operations", "equation_algebra", "geometry_space",
    "data_statistics", "application_modeling", "thinking_habits",
  ] }).notNull().default("number_operations"),
  contentTier: text("content_tier", { enum: ["core", "regional", "transition"] })
    .notNull().default("core"),
  structureTag: text("structure_tag").notNull().default("legacy"),
  estimatedSeconds: integer("estimated_seconds").notNull().default(60),
  readingLoad: text("reading_load", { enum: ["short", "medium", "long"] })
    .notNull().default("short"),
  answerMode: text("answer_mode", {
    enum: ["mental", "written", "choice", "fill", "expression", "equation"],
  }).notNull().default("written"),
  variantSpec: text("variant_spec").notNull().default("{}"),
  hintLadder: text("hint_ladder").notNull().default("[]"),
  commonErrors: text("common_errors"),
  readingCard: integer("reading_card", { mode: "boolean" }),
  source: text("source", { enum: ["original", "unknown"] }).notNull().default("unknown"),
  licenseStatus: text("license_status", { enum: ["owned", "unknown"] })
    .notNull().default("unknown"),
  stem: text("stem").notNull(),
  answerSpec: text("answer_spec").notNull(),
  explanation: text("explanation").notNull(),
  difficulty: integer("difficulty").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const diagnosticRuns = sqliteTable("diagnostic_runs", {
  id: text("id").primaryKey(),
  childId: text("child_id").notNull().references(() => users.id),
  version: integer("version").notNull(),
  status: text("status", { enum: ["in_progress", "completed", "superseded"] }).notNull(),
  currentPart: integer("current_part").notNull().default(1),
  seed: text("seed").notNull(),
  reportSnapshot: text("report_snapshot"),
  startedAt: integer("started_at").notNull(),
  completedAt: integer("completed_at"),
}, (table) => [uniqueIndex("diagnostic_run_child_version_idx").on(table.childId, table.version)]);

export const diagnosticParts = sqliteTable("diagnostic_parts", {
  runId: text("run_id").notNull().references(() => diagnosticRuns.id, { onDelete: "cascade" }),
  partNumber: integer("part_number").notNull(),
  status: text("status", { enum: ["locked", "available", "in_progress", "completed"] }).notNull(),
  startedAt: integer("started_at"),
  completedAt: integer("completed_at"),
}, (table) => [primaryKey({ columns: [table.runId, table.partNumber] })]);

export const trainingSessions = sqliteTable("training_sessions", {
  id: text("id").primaryKey(),
  childId: text("child_id").notNull().references(() => users.id),
  sessionDate: text("session_date").notNull(),
  kind: text("kind", {
    enum: ["diagnostic", "practice", "daily", "review", "assessment"],
  }).notNull().default("daily"),
  ruleVersion: text("rule_version").notNull().default("phase1"),
  targetSeconds: integer("target_seconds"),
  compositionSnapshot: text("composition_snapshot").notNull().default("{}"),
  diagnosticRunId: text("diagnostic_run_id").references(() => diagnosticRuns.id),
  diagnosticPartNumber: integer("diagnostic_part_number"),
  status: text("status", { enum: ["in_progress", "completed"] }).notNull(),
  startedAt: integer("started_at").notNull(),
  completedAt: integer("completed_at"),
}, (table) => [
  uniqueIndex("one_formal_session_per_child_day")
    .on(table.childId, table.sessionDate)
    .where(sql`${table.kind} IN ('daily', 'assessment')`),
  uniqueIndex("one_session_per_diagnostic_part")
    .on(table.diagnosticRunId, table.diagnosticPartNumber)
    .where(sql`${table.diagnosticRunId} IS NOT NULL AND ${table.diagnosticPartNumber} IS NOT NULL`),
]);

export const sessionItems = sqliteTable("session_items", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => trainingSessions.id, { onDelete: "cascade" }),
  questionTemplateId: text("question_template_id").notNull().references(() => questionTemplates.id),
  position: integer("position").notNull(),
  stemSnapshot: text("stem_snapshot").notNull(),
  answerSpecSnapshot: text("answer_spec_snapshot").notNull(),
  explanationSnapshot: text("explanation_snapshot").notNull(),
  skillIdSnapshot: text("skill_id_snapshot").notNull().references(() => skills.id),
  skillNameSnapshot: text("skill_name_snapshot").notNull(),
  difficultySnapshot: integer("difficulty_snapshot").notNull().default(1),
  contentTierSnapshot: text("content_tier_snapshot", {
    enum: ["core", "regional", "transition"],
  }).notNull().default("core"),
  structureTagSnapshot: text("structure_tag_snapshot").notNull().default("legacy"),
  variantSeed: text("variant_seed").notNull().default("phase1"),
  selectionReasonSnapshot: text("selection_reason_snapshot").notNull().default("{}"),
});

export const attempts = sqliteTable("attempts", {
  id: text("id").primaryKey(),
  sessionItemId: text("session_item_id").notNull().references(() => sessionItems.id),
  clientSubmissionId: text("client_submission_id").notNull().unique(),
  answerText: text("answer_text").notNull(),
  isCorrect: integer("is_correct", { mode: "boolean" }).notNull(),
  normalizedAnswer: text("normalized_answer").notNull(),
  explanation: text("explanation").notNull(),
  sessionCompleted: integer("session_completed", { mode: "boolean" }).notNull(),
  submittedAt: integer("submitted_at").notNull(),
});

export const masteryStates = sqliteTable("mastery_states", {
  childId: text("child_id").notNull().references(() => users.id),
  skillId: text("skill_id").notNull().references(() => skills.id),
  status: text("status", { enum: ["needs_support", "learning", "basic"] }).notNull(),
  evidenceCount: integer("evidence_count").notNull().default(0),
  correctCount: integer("correct_count").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [primaryKey({ columns: [table.childId, table.skillId] })]);
