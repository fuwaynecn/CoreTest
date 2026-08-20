import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { eq } from "drizzle-orm";
import { createDatabase } from "@/db/client";
import { migrateDatabase } from "@/db/migrate";
import { seedDatabase } from "@/db/seed";
import {
  attempts,
  questionTemplates,
  skills,
  trainingSessions,
  users,
} from "@/db/schema";
import { submitAttempt } from "@/services/training/submit-attempt";
import { createTestDatabase } from "@/test/test-db";

function columns(sqlite: DatabaseSync, table: string) {
  return (sqlite.prepare(`PRAGMA table_info('${table}')`).all() as Array<{ name: string }>)
    .map((column) => column.name);
}

function foreignKeyCheck(sqlite: DatabaseSync) {
  return sqlite.prepare("PRAGMA foreign_key_check").all();
}

function indexColumns(sqlite: DatabaseSync, table: string, index: string) {
  const indexes = sqlite.prepare(`PRAGMA index_list('${table}')`).all() as Array<{
    name: string;
    unique: number;
  }>;
  expect(indexes).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: index, unique: 1 }),
  ]));
  return (sqlite.prepare(`PRAGMA index_info('${index}')`).all() as Array<{
    name: string;
    seqno: number;
  }>).sort((left, right) => left.seqno - right.seqno).map((column) => column.name);
}

function insertPhase1Question(sqlite: DatabaseSync, input: {
  id: string;
  skillId: string;
  stem: string;
  answerSpec: string;
  explanation: string;
  difficulty: number;
}) {
  sqlite.prepare(`
    INSERT INTO question_templates (
      id, skill_id, stem, answer_spec, explanation, difficulty, active
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.id,
    input.skillId,
    input.stem,
    input.answerSpec,
    input.explanation,
    input.difficulty,
    1,
  );
}

function insertPhase1Session(sqlite: DatabaseSync, input: {
  id: string;
  childId: string;
  sessionDate: string;
  status: "in_progress" | "completed";
  startedAt: number;
  completedAt: number | null;
}) {
  sqlite.prepare(`
    INSERT INTO training_sessions (
      id, child_id, session_date, status, started_at, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    input.id,
    input.childId,
    input.sessionDate,
    input.status,
    input.startedAt,
    input.completedAt,
  );
}

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
    insertPhase1Question(db.$client, {
      id: "legacy-question",
      skillId: "legacy-skill",
      stem: "3 + 3 = ?",
      answerSpec: JSON.stringify({ kind: "number", value: 6, tolerance: 0, unit: null }),
      explanation: "旧题目的当前解析。",
      difficulty: 1,
    });
    insertPhase1Session(db.$client, {
      id: "legacy-session",
      childId: "legacy-child",
      sessionDate: "2026-08-18",
      status: "completed",
      startedAt: 1,
      completedAt: 2,
    });
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
    insertPhase1Question(db.$client, {
      id: "snapshot-question",
      skillId: "snapshot-skill",
      stem: "8 + 4 = ?",
      answerSpec: JSON.stringify({ kind: "number", value: 12, tolerance: 0, unit: null }),
      explanation: "先算 8 加 4。",
      difficulty: 1,
    });
    insertPhase1Session(db.$client, {
      id: "snapshot-session",
      childId: "snapshot-child",
      sessionDate: "2026-08-18",
      status: "completed",
      startedAt: 1,
      completedAt: 2,
    });
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

test("migrates and production-seeds populated Phase 1 data without losing history", async () => {
  const directory = mkdtempSync(join(tmpdir(), "math-trainer-phase2a-schema-"));
  const filename = join(directory, "phase1.sqlite");
  const phase1Migrations = join(directory, "phase1-migrations");
  mkdirSync(phase1Migrations);
  for (const migration of [
    "20260819140335_last_mimic",
    "20260819151632_concerned_professor_monster",
    "20260819172252_opposite_rumiko_fujikawa",
  ]) {
    cpSync(
      resolve(process.cwd(), "drizzle", migration),
      join(phase1Migrations, migration),
      { recursive: true },
    );
  }
  const db = createDatabase(filename);
  const sqlite = db.$client;

  try {
    migrateDatabase(db, phase1Migrations);
    db.insert(users).values({
      id: "phase1-child",
      role: "child",
      displayName: "孩子",
      credentialHash: "hash",
      createdAt: 1,
    }).run();
    db.insert(skills).values({
      id: "phase1-skill",
      code: "phase1-skill",
      name: "旧技能",
      domain: "数与运算",
    }).run();
    insertPhase1Question(sqlite, {
      id: "phase1-question",
      skillId: "phase1-skill",
      stem: "9 + 3 = ?",
      answerSpec: JSON.stringify({ kind: "number", value: 12, tolerance: 0, unit: null }),
      explanation: "先算 9 加 3。",
      difficulty: 2,
    });
    insertPhase1Session(sqlite, {
      id: "phase1-session",
      childId: "phase1-child",
      sessionDate: "2026-08-19",
      status: "completed",
      startedAt: 1,
      completedAt: 2,
    });
    sqlite.prepare(`
      INSERT INTO session_items (
        id, session_id, question_template_id, position, stem_snapshot,
        answer_spec_snapshot, explanation_snapshot, skill_id_snapshot, skill_name_snapshot
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "phase1-item",
      "phase1-session",
      "phase1-question",
      0,
      "9 + 3 = ?",
      JSON.stringify({ kind: "number", value: 12, tolerance: 0, unit: null }),
      "先算 9 加 3。",
      "phase1-skill",
      "旧技能",
    );
    sqlite.prepare(`
      INSERT INTO attempts (
        id, session_item_id, client_submission_id, answer_text, is_correct,
        normalized_answer, explanation, session_completed, submitted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "phase1-attempt",
      "phase1-item",
      "phase1-submission",
      "12",
      1,
      "12",
      "先算 9 加 3。",
      1,
      2,
    );

    migrateDatabase(db, resolve(process.cwd(), "drizzle"));

    expect(columns(sqlite, "question_templates")).toEqual(expect.arrayContaining([
      "domain", "content_tier", "structure_tag", "estimated_seconds",
      "reading_load", "answer_mode", "variant_spec", "hint_ladder",
      "common_errors", "reading_card", "source", "license_status",
    ]));
    expect(columns(sqlite, "training_sessions")).toEqual(expect.arrayContaining([
      "kind", "rule_version", "target_seconds", "composition_snapshot",
      "diagnostic_run_id", "diagnostic_part_number",
    ]));
    expect(columns(sqlite, "session_items")).toEqual(expect.arrayContaining([
      "difficulty_snapshot", "content_tier_snapshot", "structure_tag_snapshot",
      "variant_seed", "selection_reason_snapshot",
    ]));
    expect(sqlite.prepare(`
      SELECT
        domain,
        content_tier AS contentTier,
        structure_tag AS structureTag,
        estimated_seconds AS estimatedSeconds,
        reading_load AS readingLoad,
        answer_mode AS answerMode,
        variant_spec AS variantSpec,
        hint_ladder AS hintLadder,
        common_errors AS commonErrors,
        reading_card AS readingCard,
        source,
        license_status AS licenseStatus
      FROM question_templates
      WHERE id = 'phase1-question'
    `).get()).toEqual({
      domain: "number_operations",
      contentTier: "core",
      structureTag: "legacy",
      estimatedSeconds: 60,
      readingLoad: "short",
      answerMode: "written",
      variantSpec: "{}",
      hintLadder: "[]",
      commonErrors: null,
      readingCard: null,
      source: "unknown",
      licenseStatus: "unknown",
    });
    expect(sqlite.prepare(`
      SELECT kind, rule_version AS ruleVersion, composition_snapshot AS compositionSnapshot
      FROM training_sessions
      WHERE id = 'phase1-session'
    `).get()).toEqual({ kind: "daily", ruleVersion: "phase1", compositionSnapshot: "{}" });
    expect(sqlite.prepare(`
      SELECT
        difficulty_snapshot AS difficultySnapshot,
        content_tier_snapshot AS contentTierSnapshot,
        structure_tag_snapshot AS structureTagSnapshot,
        variant_seed AS variantSeed,
        selection_reason_snapshot AS selectionReasonSnapshot
      FROM session_items
      WHERE id = 'phase1-item'
    `).get()).toEqual({
      difficultySnapshot: 2,
      contentTierSnapshot: "core",
      structureTagSnapshot: "legacy",
      variantSeed: "phase1",
      selectionReasonSnapshot: "{}",
    });
    expect(sqlite.prepare("SELECT count(*) AS count FROM attempts").get()).toEqual({ count: 1 });
    expect(foreignKeyCheck(sqlite)).toEqual([]);

    migrateDatabase(db, resolve(process.cwd(), "drizzle"));
    expect(sqlite.prepare("SELECT count(*) AS count FROM attempts").get()).toEqual({ count: 1 });
    expect(foreignKeyCheck(sqlite)).toEqual([]);

    await seedDatabase({
      parentPassword: "parent-password",
      childPin: "2468",
      openDatabase: () => db,
    });
    expect(sqlite.prepare(`
      SELECT id, difficulty
      FROM question_templates
      WHERE id IN ('q-decimal-1', 'q-reading-1', 'q-equation-1')
      ORDER BY CASE id
        WHEN 'q-decimal-1' THEN 1
        WHEN 'q-reading-1' THEN 2
        ELSE 3
      END
    `).all()).toEqual([
      { id: "q-decimal-1", difficulty: 1 },
      { id: "q-reading-1", difficulty: 1 },
      { id: "q-equation-1", difficulty: 2 },
    ]);
    expect(sqlite.prepare("SELECT count(*) AS count FROM attempts WHERE id = 'phase1-attempt'").get())
      .toEqual({ count: 1 });
    expect(foreignKeyCheck(sqlite)).toEqual([]);

    expect(indexColumns(sqlite, "diagnostic_runs", "diagnostic_run_child_version_idx"))
      .toEqual(["child_id", "version"]);
    expect((sqlite.prepare("PRAGMA table_info('diagnostic_parts')").all() as Array<{
      name: string;
      pk: number;
    }>).filter((column) => column.pk > 0).sort((left, right) => left.pk - right.pk)
      .map((column) => column.name)).toEqual(["run_id", "part_number"]);

    sqlite.prepare(`
      INSERT INTO diagnostic_runs (
        id, child_id, version, status, current_part, seed, started_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run("diagnosis-1", "phase1-child", 1, "in_progress", 1, "seed", 3);
    expect(() => sqlite.prepare(`
      INSERT INTO diagnostic_runs (
        id, child_id, version, status, current_part, seed, started_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run("diagnosis-duplicate", "phase1-child", 1, "in_progress", 1, "seed-2", 3))
      .toThrow();

    const insertSession = sqlite.prepare(`
      INSERT INTO training_sessions (
        id, child_id, session_date, status, started_at, kind, rule_version,
        composition_snapshot, diagnostic_run_id, diagnostic_part_number
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertSession.run(
      "diagnosis-part-1",
      "phase1-child",
      "2026-08-19",
      "in_progress",
      3,
      "diagnostic",
      "phase2a",
      "{}",
      "diagnosis-1",
      1,
    );
    insertSession.run(
      "diagnosis-part-2",
      "phase1-child",
      "2026-08-19",
      "in_progress",
      3,
      "diagnostic",
      "phase2a",
      "{}",
      "diagnosis-1",
      2,
    );
    expect(() => insertSession.run(
      "diagnosis-part-1-duplicate",
      "phase1-child",
      "2026-08-20",
      "in_progress",
      3,
      "diagnostic",
      "phase2a",
      "{}",
      "diagnosis-1",
      1,
    )).toThrow();
    expect(() => insertSession.run(
      "daily-duplicate",
      "phase1-child",
      "2026-08-19",
      "in_progress",
      3,
      "daily",
      "phase2a",
      "{}",
      null,
      null,
    )).toThrow();
  } finally {
    sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
