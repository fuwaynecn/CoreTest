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
  stem: text("stem").notNull(),
  answerSpec: text("answer_spec").notNull(),
  explanation: text("explanation").notNull(),
  difficulty: integer("difficulty").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const trainingSessions = sqliteTable("training_sessions", {
  id: text("id").primaryKey(),
  childId: text("child_id").notNull().references(() => users.id),
  sessionDate: text("session_date").notNull(),
  status: text("status", { enum: ["in_progress", "completed"] }).notNull(),
  startedAt: integer("started_at").notNull(),
  completedAt: integer("completed_at"),
}, (table) => [uniqueIndex("one_session_per_child_day").on(table.childId, table.sessionDate)]);

export const sessionItems = sqliteTable("session_items", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => trainingSessions.id, { onDelete: "cascade" }),
  questionTemplateId: text("question_template_id").notNull().references(() => questionTemplates.id),
  position: integer("position").notNull(),
});

export const attempts = sqliteTable("attempts", {
  id: text("id").primaryKey(),
  sessionItemId: text("session_item_id").notNull().references(() => sessionItems.id),
  clientSubmissionId: text("client_submission_id").notNull().unique(),
  answerText: text("answer_text").notNull(),
  isCorrect: integer("is_correct", { mode: "boolean" }).notNull(),
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
