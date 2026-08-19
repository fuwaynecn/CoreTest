import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { eq } from "drizzle-orm";
import { createDatabase } from "@/db/client";
import { migrateDatabase } from "@/db/migrate";
import {
  attempts,
  questionTemplates,
  sessionItems,
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
    db.insert(sessionItems).values({
      id: "legacy-item",
      sessionId: "legacy-session",
      questionTemplateId: "legacy-question",
      position: 0,
    }).run();
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
