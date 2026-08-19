import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { eq } from "drizzle-orm";
import { createDatabase } from "@/db/client";
import { migrateDatabase } from "@/db/migrate";
import {
  attempts,
  questionTemplates,
  skills,
  trainingSessions,
  users,
} from "@/db/schema";
import { submitAttempt } from "@/services/training/submit-attempt";
import { createTestDatabase } from "@/test/test-db";

test("stores one parent and one child", () => {
  const db = createTestDatabase();
  db.insert(users).values([
    { id: "parent-1", role: "parent", displayName: "家长", credentialHash: "hash-a", createdAt: 1 },
    { id: "child-1", role: "child", displayName: "孩子", credentialHash: "hash-b", createdAt: 1 },
  ]).run();

  expect(db.select().from(users).all().map((row) => row.role).sort()).toEqual(["child", "parent"]);
});

test("migrates and stably replays an existing attempt", () => {
  const directory = mkdtempSync(join(tmpdir(), "math-trainer-legacy-attempt-"));
  const filename = join(directory, "legacy.sqlite");
  const legacyMigrations = join(directory, "legacy-migrations");
  const initialMigration = "20260819140335_last_mimic";
  mkdirSync(legacyMigrations);
  cpSync(
    resolve(process.cwd(), "drizzle", initialMigration),
    join(legacyMigrations, initialMigration),
    { recursive: true },
  );
  const db = createDatabase(filename);

  try {
    migrateDatabase(db, legacyMigrations);
    db.insert(users).values({
      id: "legacy-child",
      role: "child",
      displayName: "孩子",
      credentialHash: "hash",
      createdAt: 1,
    }).run();
    db.insert(skills).values({
      id: "legacy-skill",
      code: "legacy",
      name: "旧技能",
      domain: "数与运算",
    }).run();
    db.insert(questionTemplates).values({
      id: "legacy-question",
      skillId: "legacy-skill",
      stem: "3 + 3 = ?",
      answerSpec: JSON.stringify({ kind: "number", value: 6, tolerance: 0, unit: null }),
      explanation: "旧题目的当前解析。",
      difficulty: 1,
      active: true,
    }).run();
    db.insert(trainingSessions).values({
      id: "legacy-session",
      childId: "legacy-child",
      sessionDate: "2026-08-18",
      status: "completed",
      startedAt: 1,
      completedAt: 2,
    }).run();
    db.$client.prepare(`
      INSERT INTO session_items (id, session_id, question_template_id, position)
      VALUES (?, ?, ?, ?)
    `).run("legacy-item", "legacy-session", "legacy-question", 0);
    db.$client.prepare(`
      INSERT INTO attempts (
        id, session_item_id, client_submission_id, answer_text, is_correct, submitted_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run("legacy-attempt", "legacy-item", "legacy-submission", "06", 1, 2);

    migrateDatabase(db, resolve(process.cwd(), "drizzle"));

    expect(db.select().from(attempts).get()).toEqual({
      id: "legacy-attempt",
      sessionItemId: "legacy-item",
      clientSubmissionId: "legacy-submission",
      answerText: "06",
      isCorrect: true,
      normalizedAnswer: "06",
      explanation: "旧题目的当前解析。",
      sessionCompleted: true,
      submittedAt: 2,
    });
    const foreignKeys = db.$client.prepare("PRAGMA foreign_key_list('attempts')").all() as unknown as Array<{
      from: string;
      table: string;
      to: string;
    }>;
    expect(foreignKeys).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: "session_item_id", table: "session_items", to: "id" }),
    ]));
    expect(() => db.insert(attempts).values({
      id: "duplicate-attempt",
      sessionItemId: "legacy-item",
      clientSubmissionId: "legacy-submission",
      answerText: "6",
      isCorrect: true,
      normalizedAnswer: "6",
      explanation: "解析。",
      sessionCompleted: true,
      submittedAt: 3,
    }).run()).toThrow();
    expect(() => db.insert(attempts).values({
      id: "foreign-attempt",
      sessionItemId: "missing-item",
      clientSubmissionId: "foreign-submission",
      answerText: "6",
      isCorrect: true,
      normalizedAnswer: "6",
      explanation: "解析。",
      sessionCompleted: true,
      submittedAt: 3,
    }).run()).toThrow();

    const command = {
      childId: "legacy-child",
      sessionItemId: "legacy-item",
      clientSubmissionId: "legacy-submission",
      answerText: "different retry payload",
    };
    const legacyResult = {
      correct: true,
      normalizedAnswer: "06",
      explanation: "旧题目的当前解析。",
      sessionCompleted: true,
    };
    expect(submitAttempt(db, command)).toEqual(legacyResult);

    db.update(questionTemplates).set({ explanation: "迁移后的新解析。" })
      .where(eq(questionTemplates.id, "legacy-question")).run();
    db.update(trainingSessions).set({ status: "in_progress", completedAt: null })
      .where(eq(trainingSessions.id, "legacy-session")).run();
    expect(submitAttempt(db, command)).toEqual(legacyResult);
  } finally {
    db.$client.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("backfills immutable session snapshots in a populated pre-snapshot database", () => {
  const directory = mkdtempSync(join(tmpdir(), "math-trainer-session-snapshot-"));
  const filename = join(directory, "pre-snapshot.sqlite");
  const preSnapshotMigrations = join(directory, "pre-snapshot-migrations");
  mkdirSync(preSnapshotMigrations);
  for (const migration of [
    "20260819140335_last_mimic",
    "20260819151632_concerned_professor_monster",
  ]) {
    cpSync(
      resolve(process.cwd(), "drizzle", migration),
      join(preSnapshotMigrations, migration),
      { recursive: true },
    );
  }
  const db = createDatabase(filename);

  try {
    migrateDatabase(db, preSnapshotMigrations);
    db.insert(users).values({
      id: "snapshot-child",
      role: "child",
      displayName: "孩子",
      credentialHash: "hash",
      createdAt: 1,
    }).run();
    db.insert(skills).values({
      id: "snapshot-skill",
      code: "snapshot",
      name: "迁移前技能",
      domain: "数与运算",
    }).run();
    db.insert(questionTemplates).values({
      id: "snapshot-question",
      skillId: "snapshot-skill",
      stem: "8 + 4 = ?",
      answerSpec: JSON.stringify({ kind: "number", value: 12, tolerance: 0, unit: null }),
      explanation: "先算 8 加 4。",
      difficulty: 1,
      active: true,
    }).run();
    db.insert(trainingSessions).values({
      id: "snapshot-session",
      childId: "snapshot-child",
      sessionDate: "2026-08-18",
      status: "completed",
      startedAt: 1,
      completedAt: 2,
    }).run();
    db.$client.prepare(`
      INSERT INTO session_items (id, session_id, question_template_id, position)
      VALUES (?, ?, ?, ?)
    `).run("snapshot-item", "snapshot-session", "snapshot-question", 0);
    db.$client.prepare(`
      INSERT INTO attempts (
        id, session_item_id, client_submission_id, answer_text, is_correct,
        normalized_answer, explanation, session_completed, submitted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "snapshot-attempt",
      "snapshot-item",
      "snapshot-submission",
      "12",
      1,
      "12",
      "先算 8 加 4。",
      1,
      2,
    );

    migrateDatabase(db, resolve(process.cwd(), "drizzle"));

    expect(db.$client.prepare(`
      SELECT
        stem_snapshot AS stemSnapshot,
        answer_spec_snapshot AS answerSpecSnapshot,
        explanation_snapshot AS explanationSnapshot,
        skill_id_snapshot AS skillIdSnapshot,
        skill_name_snapshot AS skillNameSnapshot
      FROM session_items
      WHERE id = ?
    `).get("snapshot-item")).toEqual({
      stemSnapshot: "8 + 4 = ?",
      answerSpecSnapshot: JSON.stringify({ kind: "number", value: 12, tolerance: 0, unit: null }),
      explanationSnapshot: "先算 8 加 4。",
      skillIdSnapshot: "snapshot-skill",
      skillNameSnapshot: "迁移前技能",
    });
    expect(db.select().from(attempts).where(eq(attempts.id, "snapshot-attempt")).get())
      .toMatchObject({ sessionItemId: "snapshot-item", clientSubmissionId: "snapshot-submission" });

    const itemForeignKeys = db.$client.prepare("PRAGMA foreign_key_list('session_items')").all();
    expect(itemForeignKeys).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: "session_id", table: "training_sessions", to: "id" }),
      expect.objectContaining({ from: "question_template_id", table: "question_templates", to: "id" }),
      expect.objectContaining({ from: "skill_id_snapshot", table: "skills", to: "id" }),
    ]));
    expect(() => db.$client.prepare(`
      INSERT INTO session_items (
        id, session_id, question_template_id, position, stem_snapshot,
        answer_spec_snapshot, explanation_snapshot, skill_id_snapshot, skill_name_snapshot
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "snapshot-item",
      "snapshot-session",
      "snapshot-question",
      1,
      "重复主键",
      "{}",
      "解析",
      "snapshot-skill",
      "迁移前技能",
    )).toThrow();
    expect(() => db.insert(attempts).values({
      id: "duplicate-snapshot-attempt",
      sessionItemId: "snapshot-item",
      clientSubmissionId: "snapshot-submission",
      answerText: "12",
      isCorrect: true,
      normalizedAnswer: "12",
      explanation: "解析",
      sessionCompleted: true,
      submittedAt: 3,
    }).run()).toThrow();
  } finally {
    db.$client.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
