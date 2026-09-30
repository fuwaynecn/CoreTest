import { sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  check,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  role: text("role", { enum: ["parent", "child"] }).notNull(),
  displayName: text("display_name").notNull(),
  credentialHash: text("credential_hash").notNull(),
  createdAt: integer("created_at").notNull(),
  loginName: text("login_name"),
  parentId: text("parent_id").references((): AnySQLiteColumn => users.id),
  grade: integer("grade"),
  edition: text("edition", { enum: ["pep"] }).notNull().default("pep"),
  isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
}, (table) => [uniqueIndex("users_login_name_idx").on(table.loginName)]);

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
  grade: integer("grade").notNull().default(1),
  semester: integer("semester").notNull().default(1),
  expectedWeek: integer("expected_week").notNull().default(1),
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

export const questionInstances = sqliteTable("question_instances", {
  id: text("id").primaryKey(),
  templateId: text("template_id").notNull().references(() => questionTemplates.id),
  skillId: text("skill_id").notNull().references(() => skills.id),
  variantSeed: text("variant_seed").notNull(),
  variables: text("variables").notNull(),
  stem: text("stem").notNull(),
  answerSpec: text("answer_spec").notNull(),
  explanation: text("explanation").notNull(),
  difficulty: integer("difficulty").notNull(),
  fingerprint: text("fingerprint").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  generatedAt: integer("generated_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  lastUsedAt: integer("last_used_at"),
}, (table) => [
  uniqueIndex("question_instances_fingerprint_idx").on(table.fingerprint),
  check("question_instances_difficulty", sql`${table.difficulty} BETWEEN 1 AND 4`),
]);

export const questionBankRefreshes = sqliteTable("question_bank_refreshes", {
  weekKey: text("week_key").primaryKey(),
  completedAt: integer("completed_at").notNull(),
  generatedCount: integer("generated_count").notNull(),
  errors: text("errors").notNull().default("[]"),
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

export const learningPlans = sqliteTable("learning_plans", {
  id: text("id").primaryKey(),
  childId: text("child_id").notNull().references(() => users.id),
  diagnosisRunId: text("diagnosis_run_id").notNull().references(() => diagnosticRuns.id),
  version: integer("version").notNull(),
  revision: integer("revision").notNull().default(1),
  status: text("status", { enum: ["active", "completed", "superseded"] }).notNull(),
  startsOn: text("starts_on").notNull(),
  endsOn: text("ends_on").notNull(),
  reasonSnapshot: text("reason_snapshot").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [uniqueIndex("learning_plan_child_version_idx").on(
  table.childId,
  table.version,
  table.revision,
)]);

export const planTargets = sqliteTable("plan_targets", {
  planId: text("plan_id").notNull().references(() => learningPlans.id, { onDelete: "cascade" }),
  weekNumber: integer("week_number").notNull(),
  targetKey: text("target_key").notNull(),
  skillId: text("skill_id").references(() => skills.id),
  track: text("track", { enum: ["computation", "equation"] }),
  category: text("category", { enum: ["weakness", "review", "reading", "extension"] }).notNull(),
  minimum: integer("minimum").notNull(),
  target: integer("target").notNull(),
  maximum: integer("maximum").notNull(),
  reasonCode: text("reason_code").notNull(),
}, (table) => [
  primaryKey({ columns: [table.planId, table.weekNumber, table.targetKey] }),
  check("plan_targets_week_number", sql`${table.weekNumber} BETWEEN 1 AND 6`),
  check("plan_targets_target_order", sql`${table.minimum} <= ${table.target} AND ${table.target} <= ${table.maximum}`),
]);

export const parentPreferences = sqliteTable("parent_preferences", {
  childId: text("child_id").primaryKey().references(() => users.id),
  trainingWeekdays: text("training_weekdays").notNull(),
  targetMinutes: integer("target_minutes").notNull().default(30),
  specialistFocus: text("specialist_focus", {
    enum: ["none", "computation", "equation", "reading"],
  }).notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const aiProviderConfigs = sqliteTable("ai_provider_configs", {
  provider: text("provider", { enum: ["openai", "deepseek"] }).notNull().primaryKey(),
  baseUrl: text("base_url").notNull(),
  model: text("model").notNull(),
  encryptedApiKey: text("encrypted_api_key"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  check("ai_provider_configs_provider", sql`${table.provider} IN ('openai', 'deepseek')`),
]);

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
  learningPlanId: text("learning_plan_id").references(() => learningPlans.id),
  planRevision: integer("plan_revision").notNull().default(0),
  diagnosticRunId: text("diagnostic_run_id").references(() => diagnosticRuns.id),
  diagnosticPartNumber: integer("diagnostic_part_number"),
  status: text("status", { enum: ["in_progress", "completed", "completed_early"] }).notNull(),
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
  questionInstanceId: text("question_instance_id").references(() => questionInstances.id),
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
  activeDurationMs: integer("active_duration_ms"),
  hintLevel: integer("hint_level"),
  hintCount: integer("hint_count"),
  correctionNumber: integer("correction_number"),
  readingCardResponse: text("reading_card_response"),
  rewardSummary: text("reward_summary"),
  submittedAt: integer("submitted_at").notNull(),
}, (table) => [
  check("attempts_active_duration_nonnegative", sql`${table.activeDurationMs} IS NULL OR ${table.activeDurationMs} >= 0`),
  check("attempts_hint_level_range", sql`${table.hintLevel} IS NULL OR ${table.hintLevel} BETWEEN 0 AND 3`),
  check("attempts_hint_count_range", sql`${table.hintCount} IS NULL OR ${table.hintCount} BETWEEN 0 AND 3`),
  check("attempts_correction_number_nonnegative", sql`${table.correctionNumber} IS NULL OR ${table.correctionNumber} >= 0`),
]);

export const rewardEvents = sqliteTable("reward_events", {
  id: text("id").primaryKey(),
  childId: text("child_id").notNull().references(() => users.id),
  sourceKey: text("source_key").notNull().unique(),
  kind: text("kind", { enum: ["points", "badge"] }).notNull(),
  code: text("code").notNull(),
  points: integer("points").notNull().default(0),
  sessionId: text("session_id").references(() => trainingSessions.id),
  attemptId: text("attempt_id").references(() => attempts.id),
  occurredAt: integer("occurred_at").notNull(),
  metadata: text("metadata").notNull().default("{}"),
}, (table) => [
  check("reward_events_kind", sql`${table.kind} IN ('points', 'badge')`),
]);

export const hintEvents = sqliteTable("hint_events", {
  id: text("id").primaryKey(),
  childId: text("child_id").notNull().references(() => users.id),
  sessionItemId: text("session_item_id").notNull()
    .references(() => sessionItems.id, { onDelete: "cascade" }),
  hintLevel: integer("hint_level").notNull(),
  revealedAt: integer("revealed_at").notNull(),
}, (table) => [
  uniqueIndex("hint_event_item_level_idx").on(table.sessionItemId, table.hintLevel),
  check("hint_events_level_range", sql`${table.hintLevel} BETWEEN 1 AND 3`),
]);

export const hintRequests = sqliteTable("hint_requests", {
  requestId: text("request_id").primaryKey(),
  childId: text("child_id").notNull().references(() => users.id),
  sessionItemId: text("session_item_id").notNull()
    .references(() => sessionItems.id, { onDelete: "cascade" }),
  hintLevel: integer("hint_level").notNull(),
  requestedAt: integer("requested_at").notNull(),
}, (table) => [
  check("hint_requests_level_range", sql`${table.hintLevel} BETWEEN 1 AND 3`),
]);

export const masteryEvidence = sqliteTable("mastery_evidence", {
  id: text("id").primaryKey(),
  childId: text("child_id").notNull().references(() => users.id),
  skillId: text("skill_id").notNull().references(() => skills.id),
  sessionItemId: text("session_item_id").notNull().references(() => sessionItems.id),
  templateId: text("template_id").notNull().references(() => questionTemplates.id),
  purpose: text("purpose", { enum: ["diagnostic", "learning", "review", "assessment"] }).notNull(),
  firstAttemptCorrect: integer("first_attempt_correct", { mode: "boolean" }).notNull(),
  independent: integer("independent", { mode: "boolean" }).notNull(),
  hintLevel: integer("hint_level"),
  dosageTrack: text("dosage_track", { enum: ["computation", "equation"] }),
  difficulty: integer("difficulty").notNull(),
  structureTag: text("structure_tag").notNull(),
  occurredOn: text("occurred_on").notNull(),
  occurredAt: integer("occurred_at").notNull(),
  diagnosticRunId: text("diagnostic_run_id").references(() => diagnosticRuns.id),
  diagnosticCompletedOn: text("diagnostic_completed_on"),
  diagnosticCompletedAt: integer("diagnostic_completed_at"),
  reviewIntervalDays: integer("review_interval_days").notNull().default(0),
}, (table) => [
  uniqueIndex("mastery_evidence_source_idx").on(table.sessionItemId),
  check("mastery_evidence_purpose", sql`${table.purpose} IN ('diagnostic', 'learning', 'review', 'assessment')`),
  check("mastery_evidence_first_correct_boolean", sql`${table.firstAttemptCorrect} IN (0, 1)`),
  check("mastery_evidence_independent_boolean", sql`${table.independent} IN (0, 1)`),
  check("mastery_evidence_hint_level", sql`${table.hintLevel} IS NULL OR ${table.hintLevel} BETWEEN 0 AND 3`),
  check("mastery_evidence_hint_independence", sql`${table.independent} = 0 OR ${table.hintLevel} = 0`),
  check("mastery_evidence_dosage_track", sql`${table.dosageTrack} IS NULL OR ${table.dosageTrack} IN ('computation', 'equation')`),
  check("mastery_evidence_difficulty_range", sql`${table.difficulty} BETWEEN 1 AND 4`),
  check("mastery_evidence_review_interval", sql`${table.reviewIntervalDays} IN (0, 1, 3, 7, 14, 30)`),
  check("mastery_evidence_review_purpose", sql`(${table.purpose} = 'review' AND ${table.reviewIntervalDays} IN (1, 3, 7, 14, 30)) OR (${table.purpose} <> 'review' AND ${table.reviewIntervalDays} = 0)`),
  check("mastery_evidence_diagnostic_group", sql`(
    ${table.purpose} = 'diagnostic'
    AND ((${table.diagnosticRunId} IS NULL AND ${table.diagnosticCompletedOn} IS NULL AND ${table.diagnosticCompletedAt} IS NULL)
      OR (${table.diagnosticRunId} IS NOT NULL AND ${table.diagnosticCompletedOn} IS NOT NULL AND ${table.diagnosticCompletedAt} IS NOT NULL))
  ) OR (${table.purpose} <> 'diagnostic' AND ${table.diagnosticRunId} IS NULL AND ${table.diagnosticCompletedOn} IS NULL AND ${table.diagnosticCompletedAt} IS NULL)`),
]);

const errorCauses = [
  "missing_unit",
  "copied_number",
  "calculation",
  "relationship",
  "range_check",
  "incomplete_reading",
  "unknown",
] as const;

const childErrorReports = [
  "did_not_read",
  "missed_condition_or_unit",
  "calculation_slip",
  "method_unknown",
] as const;

export const errorObservations = sqliteTable("error_observations", {
  id: text("id").primaryKey(),
  childId: text("child_id").notNull().references(() => users.id),
  sessionItemId: text("session_item_id").notNull().references(() => sessionItems.id),
  attemptId: text("attempt_id").references(() => attempts.id),
  source: text("source", { enum: ["system", "child", "parent"] }).notNull(),
  systemCandidate: text("system_candidate", { enum: errorCauses }),
  childSelfReport: text("child_self_report", { enum: childErrorReports }),
  parentCorrection: text("parent_correction", { enum: errorCauses }),
  previousValue: text("previous_value", { enum: [...errorCauses, ...childErrorReports] }),
  previousObservationId: text("previous_observation_id")
    .references((): AnySQLiteColumn => errorObservations.id),
  actorId: text("actor_id").references(() => users.id),
  observedAt: integer("observed_at").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  check("error_observations_source", sql`${table.source} IN ('system', 'child', 'parent')`),
  check("error_observations_system_candidate", sql`${table.systemCandidate} IS NULL OR ${table.systemCandidate} IN ('missing_unit', 'copied_number', 'calculation', 'relationship', 'range_check', 'incomplete_reading', 'unknown')`),
  check("error_observations_child_report", sql`${table.childSelfReport} IS NULL OR ${table.childSelfReport} IN ('did_not_read', 'missed_condition_or_unit', 'calculation_slip', 'method_unknown')`),
  check("error_observations_parent_correction", sql`${table.parentCorrection} IS NULL OR ${table.parentCorrection} IN ('missing_unit', 'copied_number', 'calculation', 'relationship', 'range_check', 'incomplete_reading', 'unknown')`),
  check("error_observations_previous_value", sql`${table.previousValue} IS NULL OR ${table.previousValue} IN ('missing_unit', 'copied_number', 'calculation', 'relationship', 'range_check', 'incomplete_reading', 'unknown', 'did_not_read', 'missed_condition_or_unit', 'calculation_slip', 'method_unknown')`),
  check("error_observations_event_shape", sql`(
    (${table.source} = 'system' AND ${table.systemCandidate} IS NOT NULL AND ${table.childSelfReport} IS NULL AND ${table.parentCorrection} IS NULL AND ${table.previousValue} IS NULL AND ${table.actorId} IS NULL AND ${table.previousObservationId} IS NULL)
    OR (${table.source} = 'child' AND ${table.systemCandidate} IS NULL AND ${table.childSelfReport} IS NOT NULL AND ${table.parentCorrection} IS NULL AND ${table.previousValue} IS NOT NULL AND ${table.actorId} IS NOT NULL AND ${table.previousObservationId} IS NOT NULL)
    OR (${table.source} = 'parent' AND ${table.systemCandidate} IS NULL AND ${table.childSelfReport} IS NULL AND ${table.parentCorrection} IS NOT NULL AND ${table.previousValue} IS NOT NULL AND ${table.actorId} IS NOT NULL AND ${table.previousObservationId} IS NOT NULL)
  )`),
]);

export const reviewSchedules = sqliteTable("review_schedules", {
  childId: text("child_id").notNull().references(() => users.id),
  skillId: text("skill_id").notNull().references(() => skills.id),
  level: integer("level").notNull(),
  dueOn: text("due_on").notNull(),
  lastResult: text("last_result", {
    enum: ["independent_correct", "hinted_correct", "corrected", "incorrect"],
  }),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.childId, table.skillId] }),
  check("review_schedules_level_range", sql`${table.level} BETWEEN 0 AND 4`),
  check("review_schedules_last_result", sql`${table.lastResult} IS NULL OR ${table.lastResult} IN ('independent_correct', 'hinted_correct', 'corrected', 'incorrect')`),
]);

export const dosageStates = sqliteTable("dosage_states", {
  childId: text("child_id").notNull().references(() => users.id),
  track: text("track", { enum: ["computation", "equation"] }).notNull(),
  level: integer("level").notNull(),
  weeklyTarget: integer("weekly_target").notNull(),
  sessionMinimum: integer("session_minimum").notNull(),
  sessionTarget: integer("session_target").notNull(),
  sessionMaximum: integer("session_maximum").notNull(),
  reasonJson: text("reason_json").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.childId, table.track] }),
  check("dosage_states_track", sql`${table.track} IN ('computation', 'equation')`),
  check("dosage_states_level_range", sql`(${table.track} = 'computation' AND ${table.level} BETWEEN 1 AND 7) OR (${table.track} = 'equation' AND ${table.level} BETWEEN 1 AND 6)`),
  check("dosage_states_track_targets", sql`(
    ${table.track} = 'computation'
    AND ${table.weeklyTarget} BETWEEN 60 AND 95
    AND ${table.sessionMinimum} BETWEEN 12 AND 19
    AND ${table.sessionTarget} BETWEEN 12 AND 19
    AND ${table.sessionMaximum} BETWEEN 12 AND 19
  ) OR (
    ${table.track} = 'equation'
    AND ${table.weeklyTarget} BETWEEN 15 AND 20
    AND ${table.sessionMinimum} BETWEEN 4 AND 6
    AND ${table.sessionTarget} BETWEEN 4 AND 6
    AND ${table.sessionMaximum} BETWEEN 4 AND 6
  )`),
  check("dosage_states_target_order", sql`${table.sessionMinimum} <= ${table.sessionTarget} AND ${table.sessionTarget} <= ${table.sessionMaximum}`),
]);

export const masteryStates = sqliteTable("mastery_states", {
  childId: text("child_id").notNull().references(() => users.id),
  skillId: text("skill_id").notNull().references(() => skills.id),
  status: text("status", {
    enum: ["undiagnosed", "needs_support", "learning", "basic", "stable"],
  }).notNull(),
  evidenceCount: integer("evidence_count").notNull().default(0),
  correctCount: integer("correct_count").notNull().default(0),
  reasonCode: text("reason_code").notNull().default("legacy_snapshot"),
  evidenceCursor: text("evidence_cursor"),
  evidenceVersion: integer("evidence_version").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.childId, table.skillId] }),
  check("mastery_states_status", sql`${table.status} IN ('undiagnosed', 'needs_support', 'learning', 'basic', 'stable')`),
  check("mastery_states_counts", sql`${table.evidenceCount} >= 0 AND ${table.correctCount} >= 0 AND ${table.correctCount} <= ${table.evidenceCount}`),
  check("mastery_states_evidence_version", sql`${table.evidenceVersion} >= 0`),
]);

export const childSkillSettings = sqliteTable("child_skill_settings", {
  childId: text("child_id").notNull().references(() => users.id),
  skillId: text("skill_id").notNull().references(() => skills.id),
  mode: text("mode", { enum: ["auto", "on", "off"] }).notNull().default("auto"),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [primaryKey({ columns: [table.childId, table.skillId] })]);

export const academicCalendar = sqliteTable("academic_calendar", {
  schoolYear: text("school_year").primaryKey(),
  semester1Start: text("semester1_start").notNull(),
  semester2Start: text("semester2_start").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
