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

function primaryKeyColumns(sqlite: DatabaseSync, table: string) {
  return (sqlite.prepare(`PRAGMA table_info('${table}')`).all() as Array<{
    name: string;
    pk: number;
  }>).filter((column) => column.pk > 0)
    .sort((left, right) => left.pk - right.pk)
    .map((column) => column.name);
}

function foreignKeyTargets(sqlite: DatabaseSync, table: string) {
  return (sqlite.prepare(`PRAGMA foreign_key_list('${table}')`).all() as Array<{
    from: string;
    table: string;
    to: string;
    on_delete: string;
  }>).map((foreignKey) => ({
    from: foreignKey.from,
    table: foreignKey.table,
    to: foreignKey.to,
    onDelete: foreignKey.on_delete,
  }));
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
      activeDurationMs: null,
      hintLevel: null,
      hintCount: null,
      correctionNumber: null,
      readingCardResponse: null,
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
      rewards: { pointsEarned: 0, totalPoints: 0, newBadges: [] },
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

test("adds Phase 2B learning state without inventing legacy telemetry or losing completed diagnosis history", () => {
  const directory = mkdtempSync(join(tmpdir(), "math-trainer-phase2b-schema-"));
  const filename = join(directory, "phase2a.sqlite");
  const phase2aMigrations = join(directory, "phase2a-migrations");
  mkdirSync(phase2aMigrations);
  for (const migration of [
    "20260819140335_last_mimic",
    "20260819151632_concerned_professor_monster",
    "20260819172252_opposite_rumiko_fujikawa",
    "20260820035833_phase2a_diagnosis",
    "20260820083528_phase2a_template_metadata",
  ]) {
    cpSync(
      resolve(process.cwd(), "drizzle", migration),
      join(phase2aMigrations, migration),
      { recursive: true },
    );
  }
  const db = createDatabase(filename);
  const sqlite = db.$client;

  try {
    migrateDatabase(db, phase2aMigrations);
    sqlite.prepare(`
      INSERT INTO users (id, role, display_name, credential_hash, created_at)
      VALUES ('phase2b-child', 'child', '孩子', 'hash', 1),
             ('phase2b-parent', 'parent', '家长', 'hash', 1)
    `).run();
    sqlite.prepare(`
      INSERT INTO skills (id, code, name, domain)
      VALUES ('phase2b-skill', 'phase2b-skill', '小数计算', 'number_operations')
    `).run();
    sqlite.prepare(`
      INSERT INTO question_templates (
        id, skill_id, stem, answer_spec, explanation, difficulty, active
      ) VALUES (
        'phase2b-question', 'phase2b-skill', '0.8 + 0.4 = ?',
        '{"kind":"number","value":1.2,"tolerance":0,"unit":null}',
        '小数点对齐。', 2, 1
      )
    `).run();
    sqlite.prepare(`
      INSERT INTO diagnostic_runs (
        id, child_id, version, status, current_part, seed, report_snapshot,
        started_at, completed_at
      ) VALUES (
        'phase2b-diagnosis', 'phase2b-child', 1, 'completed', 3, 'seed',
        '{"version":1,"summary":"completed"}', 10, 40
      )
    `).run();
    for (const partNumber of [1, 2, 3]) {
      sqlite.prepare(`
        INSERT INTO diagnostic_parts (
          run_id, part_number, status, started_at, completed_at
        ) VALUES ('phase2b-diagnosis', ?, 'completed', ?, ?)
      `).run(partNumber, partNumber * 10, partNumber * 10 + 5);
    }
    sqlite.prepare(`
      INSERT INTO training_sessions (
        id, child_id, session_date, kind, rule_version, composition_snapshot,
        status, started_at, completed_at
      ) VALUES (
        'phase2b-session', 'phase2b-child', '2026-08-19', 'daily', 'phase2a', '{}',
        'completed', 50, 60
      )
    `).run();
    sqlite.prepare(`
      INSERT INTO session_items (
        id, session_id, question_template_id, position, stem_snapshot,
        answer_spec_snapshot, explanation_snapshot, skill_id_snapshot,
        skill_name_snapshot, difficulty_snapshot, content_tier_snapshot,
        structure_tag_snapshot, variant_seed, selection_reason_snapshot
      ) VALUES (
        'phase2b-item', 'phase2b-session', 'phase2b-question', 0, '0.8 + 0.4 = ?',
        '{"kind":"number","value":1.2,"tolerance":0,"unit":null}',
        '小数点对齐。', 'phase2b-skill', '小数计算', 2, 'core',
        'decimal-add', 'legacy-seed', '{}'
      )
    `).run();
    const insertAttempt = sqlite.prepare(`
      INSERT INTO attempts (
        id, session_item_id, client_submission_id, answer_text, is_correct,
        normalized_answer, explanation, session_completed, submitted_at
      ) VALUES (?, 'phase2b-item', ?, ?, ?, ?, '小数点对齐。', ?, ?)
    `);
    insertAttempt.run("phase2b-attempt-1", "submission-1", "1.1", 0, "1.1", 0, 55);
    insertAttempt.run("phase2b-attempt-2", "submission-2", "1.2", 1, "1.2", 1, 60);
    sqlite.prepare(`
      INSERT INTO mastery_states (
        child_id, skill_id, status, evidence_count, correct_count, updated_at
      ) VALUES ('phase2b-child', 'phase2b-skill', 'learning', 2, 1, 60)
    `).run();

    migrateDatabase(db, resolve(process.cwd(), "drizzle"));

    expect(columns(sqlite, "attempts")).toEqual(expect.arrayContaining([
      "active_duration_ms", "hint_level", "hint_count", "correction_number",
    ]));
    const rewardTableInfo = sqlite.prepare("PRAGMA table_info('reward_events')").all() as Array<{
      name: string;
      dflt_value: string | null;
    }>;
    expect(rewardTableInfo.map((column) => column.name)).toEqual([
      "id", "child_id", "source_key", "kind", "code", "points",
      "session_id", "attempt_id", "occurred_at", "metadata",
    ]);
    expect(rewardTableInfo.find((column) => column.name === "points")?.dflt_value).toBe("0");
    expect(rewardTableInfo.find((column) => column.name === "metadata")?.dflt_value).toBe("'{}'");
    expect(foreignKeyTargets(sqlite, "reward_events")).toEqual(expect.arrayContaining([
      { from: "child_id", table: "users", to: "id", onDelete: "NO ACTION" },
      { from: "session_id", table: "training_sessions", to: "id", onDelete: "NO ACTION" },
      { from: "attempt_id", table: "attempts", to: "id", onDelete: "NO ACTION" },
    ]));
    sqlite.prepare(`
      INSERT INTO reward_events (id, child_id, source_key, kind, code, session_id, attempt_id, occurred_at)
      VALUES ('reward-event-1', 'phase2b-child', 'attempt:phase2b-attempt-1', 'points', 'reading-card', 'phase2b-session', 'phase2b-attempt-1', 70)
    `).run();
    expect(() => sqlite.prepare(`
      INSERT INTO reward_events (id, child_id, source_key, kind, code, occurred_at)
      VALUES ('reward-event-duplicate', 'phase2b-child', 'attempt:phase2b-attempt-1', 'points', 'reading-card', 71)
    `).run()).toThrow();
    expect(() => sqlite.prepare(`
      INSERT INTO reward_events (id, child_id, source_key, kind, code, occurred_at)
      VALUES ('reward-event-invalid-kind', 'phase2b-child', 'invalid-kind', 'invalid', 'reading-card', 72)
    `).run()).toThrow();
    expect(sqlite.prepare("SELECT points, metadata FROM reward_events WHERE id = 'reward-event-1'").get())
      .toEqual({ points: 0, metadata: "{}" });
    expect(primaryKeyColumns(sqlite, "mastery_evidence")).toEqual(["id"]);
    expect(columns(sqlite, "mastery_evidence")).toEqual(expect.arrayContaining([
      "template_id", "hint_level", "diagnostic_run_id", "diagnostic_completed_on",
      "diagnostic_completed_at", "review_interval_days", "dosage_track",
    ]));
    expect(indexColumns(sqlite, "mastery_evidence", "mastery_evidence_source_idx"))
      .toEqual(["session_item_id"]);
    expect(primaryKeyColumns(sqlite, "review_schedules")).toEqual(["child_id", "skill_id"]);
    expect(primaryKeyColumns(sqlite, "dosage_states")).toEqual(["child_id", "track"]);
    expect(primaryKeyColumns(sqlite, "mastery_states")).toEqual(["child_id", "skill_id"]);
    expect(indexColumns(sqlite, "hint_events", "hint_event_item_level_idx"))
      .toEqual(["session_item_id", "hint_level"]);
    expect(primaryKeyColumns(sqlite, "hint_requests")).toEqual(["request_id"]);
    expect(foreignKeyTargets(sqlite, "mastery_evidence")).toEqual(expect.arrayContaining([
      { from: "child_id", table: "users", to: "id", onDelete: "NO ACTION" },
      { from: "skill_id", table: "skills", to: "id", onDelete: "NO ACTION" },
      { from: "session_item_id", table: "session_items", to: "id", onDelete: "NO ACTION" },
      { from: "template_id", table: "question_templates", to: "id", onDelete: "NO ACTION" },
      { from: "diagnostic_run_id", table: "diagnostic_runs", to: "id", onDelete: "NO ACTION" },
    ]));
    expect(foreignKeyTargets(sqlite, "error_observations")).toEqual(expect.arrayContaining([
      { from: "session_item_id", table: "session_items", to: "id", onDelete: "NO ACTION" },
      { from: "attempt_id", table: "attempts", to: "id", onDelete: "NO ACTION" },
      { from: "previous_observation_id", table: "error_observations", to: "id", onDelete: "NO ACTION" },
      { from: "actor_id", table: "users", to: "id", onDelete: "NO ACTION" },
    ]));
    expect(foreignKeyTargets(sqlite, "hint_events")).toEqual(expect.arrayContaining([
      { from: "child_id", table: "users", to: "id", onDelete: "NO ACTION" },
      { from: "session_item_id", table: "session_items", to: "id", onDelete: "CASCADE" },
    ]));
    expect(foreignKeyTargets(sqlite, "hint_requests")).toEqual(expect.arrayContaining([
      { from: "child_id", table: "users", to: "id", onDelete: "NO ACTION" },
      { from: "session_item_id", table: "session_items", to: "id", onDelete: "CASCADE" },
    ]));
    expect(foreignKeyTargets(sqlite, "review_schedules")).toEqual(expect.arrayContaining([
      { from: "child_id", table: "users", to: "id", onDelete: "NO ACTION" },
      { from: "skill_id", table: "skills", to: "id", onDelete: "NO ACTION" },
    ]));
    expect(foreignKeyTargets(sqlite, "dosage_states")).toEqual(expect.arrayContaining([
      { from: "child_id", table: "users", to: "id", onDelete: "NO ACTION" },
    ]));
    expect(foreignKeyCheck(sqlite)).toEqual([]);

    expect(sqlite.prepare(`
      SELECT active_duration_ms, hint_level, hint_count, correction_number
      FROM attempts WHERE id = 'phase2b-attempt-1'
    `).get()).toEqual({
      active_duration_ms: null,
      hint_level: null,
      hint_count: null,
      correction_number: null,
    });
    expect(sqlite.prepare("SELECT count(*) AS count FROM mastery_evidence").get())
      .toEqual({ count: 0 });
    expect(sqlite.prepare(`
      SELECT status, report_snapshot AS reportSnapshot, completed_at AS completedAt
      FROM diagnostic_runs WHERE id = 'phase2b-diagnosis'
    `).get()).toEqual({
      status: "completed",
      reportSnapshot: '{"version":1,"summary":"completed"}',
      completedAt: 40,
    });
    expect(sqlite.prepare("SELECT count(*) AS count FROM diagnostic_parts WHERE run_id = 'phase2b-diagnosis'").get())
      .toEqual({ count: 3 });
    expect(sqlite.prepare("SELECT count(*) AS count FROM attempts WHERE session_item_id = 'phase2b-item'").get())
      .toEqual({ count: 2 });
    expect(sqlite.prepare(`
      SELECT status, evidence_count AS evidenceCount, correct_count AS correctCount,
        reason_code AS reasonCode, evidence_cursor AS evidenceCursor,
        evidence_version AS evidenceVersion
      FROM mastery_states
      WHERE child_id = 'phase2b-child' AND skill_id = 'phase2b-skill'
    `).get()).toEqual({
      status: "learning",
      evidenceCount: 2,
      correctCount: 1,
      reasonCode: "legacy_snapshot",
      evidenceCursor: null,
      evidenceVersion: 0,
    });

    expect(() => sqlite.prepare(`
      UPDATE attempts SET hint_level = 4 WHERE id = 'phase2b-attempt-1'
    `).run()).toThrow();

    expect(() => sqlite.prepare(`
      INSERT INTO mastery_evidence (
        id, child_id, skill_id, session_item_id, template_id, purpose, first_attempt_correct,
        independent, hint_level, difficulty, structure_tag, occurred_on, occurred_at,
        review_interval_days
      ) VALUES (
        'bad-evidence', 'phase2b-child', 'phase2b-skill', 'phase2b-item', 'phase2b-question',
        'guess', 1, 1, 0, 2, 'decimal-add', '2026-08-19', 55, 0
      )
    `).run()).toThrow();
    expect(() => sqlite.prepare(`
      INSERT INTO review_schedules (
        child_id, skill_id, level, due_on, last_result, updated_at
      ) VALUES ('phase2b-child', 'phase2b-skill', 5, '2026-08-20', 'incorrect', 60)
    `).run()).toThrow();
    expect(() => sqlite.prepare(`
      INSERT INTO dosage_states (
        child_id, track, level, weekly_target, session_minimum, session_target,
        session_maximum, reason_json, updated_at
      ) VALUES ('phase2b-child', 'equation', 1, 1000, 4, 5, 6, '{}', 60)
    `).run()).toThrow();
    expect(() => sqlite.prepare(`
      UPDATE mastery_states SET status = 'expert'
      WHERE child_id = 'phase2b-child' AND skill_id = 'phase2b-skill'
    `).run()).toThrow();
    expect(() => sqlite.prepare(`
      INSERT INTO hint_events (id, child_id, session_item_id, hint_level, revealed_at)
      VALUES ('bad-hint', 'phase2b-child', 'phase2b-item', 4, 60)
    `).run()).toThrow();
    expect(() => sqlite.prepare(`
      INSERT INTO error_observations (
        id, child_id, session_item_id, source, system_candidate, actor_id,
        observed_at, created_at
      ) VALUES (
        'bad-observation', 'phase2b-child', 'phase2b-item', 'child',
        'calculation', 'phase2b-child', 60, 60
      )
    `).run()).toThrow();

    sqlite.prepare(`
      INSERT INTO mastery_evidence (
        id, child_id, skill_id, session_item_id, template_id, purpose, first_attempt_correct,
        independent, hint_level, difficulty, structure_tag, occurred_on, occurred_at
      ) VALUES (
        'evidence-1', 'phase2b-child', 'phase2b-skill', 'phase2b-item', 'phase2b-question',
        'learning', 0, 1, 0, 2, 'decimal-add', '2026-08-19', 55
      )
    `).run();
    expect(sqlite.prepare(`
      SELECT review_interval_days AS reviewIntervalDays
      FROM mastery_evidence WHERE id = 'evidence-1'
    `).get()).toEqual({ reviewIntervalDays: 0 });
    expect(sqlite.prepare(`
      SELECT dosage_track AS dosageTrack
      FROM mastery_evidence WHERE id = 'evidence-1'
    `).get()).toEqual({ dosageTrack: null });
    expect(() => sqlite.prepare(`
      UPDATE mastery_evidence SET hint_level = 2 WHERE id = 'evidence-1'
    `).run()).toThrow();
    expect(() => sqlite.prepare(`
      UPDATE mastery_evidence SET review_interval_days = 7 WHERE id = 'evidence-1'
    `).run()).toThrow();
    expect(() => sqlite.prepare(`
      UPDATE mastery_evidence SET purpose = 'review' WHERE id = 'evidence-1'
    `).run()).toThrow();
    expect(() => sqlite.prepare(`
      UPDATE mastery_evidence SET purpose = 'review', review_interval_days = 2
      WHERE id = 'evidence-1'
    `).run()).toThrow();
    expect(() => sqlite.prepare(`
      UPDATE mastery_evidence SET dosage_track = 'geometry'
      WHERE id = 'evidence-1'
    `).run()).toThrow();
    expect(() => sqlite.prepare(`
      INSERT INTO mastery_evidence (
        id, child_id, skill_id, session_item_id, template_id, purpose, first_attempt_correct,
        independent, hint_level, difficulty, structure_tag, occurred_on, occurred_at
      ) VALUES (
        'evidence-duplicate', 'phase2b-child', 'phase2b-skill', 'phase2b-item', 'phase2b-question',
        'learning', 1, 1, 0, 2, 'decimal-add', '2026-08-19', 60
      )
    `).run()).toThrow();
    expect(() => sqlite.prepare("DELETE FROM session_items WHERE id = 'phase2b-item'").run())
      .toThrow();

    sqlite.prepare(`
      INSERT INTO error_observations (
        id, child_id, session_item_id, attempt_id, source, system_candidate,
        observed_at, created_at
      ) VALUES (
        'observation-system', 'phase2b-child', 'phase2b-item', 'phase2b-attempt-1',
        'system', 'calculation', 55, 55
      )
    `).run();
    sqlite.prepare(`
      INSERT INTO review_schedules (
        child_id, skill_id, level, due_on, last_result, updated_at
      ) VALUES ('phase2b-child', 'phase2b-skill', 0, '2026-08-20', NULL, 60)
    `).run();
    expect(() => sqlite.prepare(`
      INSERT INTO review_schedules (
        child_id, skill_id, level, due_on, last_result, updated_at
      ) VALUES ('phase2b-child', 'phase2b-skill', 1, '2026-08-21', NULL, 61)
    `).run()).toThrow();
    sqlite.prepare(`
      INSERT INTO dosage_states (
        child_id, track, level, weekly_target, session_minimum, session_target,
        session_maximum, reason_json, updated_at
      ) VALUES ('phase2b-child', 'equation', 1, 20, 4, 5, 6, '{}', 60)
    `).run();
    expect(() => sqlite.prepare(`
      UPDATE dosage_states SET weekly_target = 1000
      WHERE child_id = 'phase2b-child' AND track = 'equation'
    `).run()).toThrow();
    expect(() => sqlite.prepare(`
      INSERT INTO dosage_states (
        child_id, track, level, weekly_target, session_minimum, session_target,
        session_maximum, reason_json, updated_at
      ) VALUES ('phase2b-child', 'equation', 2, 20, 4, 5, 6, '{}', 61)
    `).run()).toThrow();
    sqlite.prepare(`
      INSERT INTO dosage_states (
        child_id, track, level, weekly_target, session_minimum, session_target,
        session_maximum, reason_json, updated_at
      ) VALUES ('phase2b-child', 'computation', 1, 60, 12, 15, 19, '{}', 60)
    `).run();
    expect(() => sqlite.prepare(`
      UPDATE dosage_states SET session_target = 1000
      WHERE child_id = 'phase2b-child' AND track = 'computation'
    `).run()).toThrow();
    sqlite.prepare(`
      UPDATE review_schedules SET last_result = 'corrected'
      WHERE child_id = 'phase2b-child' AND skill_id = 'phase2b-skill'
    `).run();
    expect(sqlite.prepare(`
      SELECT last_result AS lastResult FROM review_schedules
      WHERE child_id = 'phase2b-child' AND skill_id = 'phase2b-skill'
    `).get()).toEqual({ lastResult: "corrected" });
    sqlite.prepare(`
      INSERT INTO error_observations (
        id, child_id, session_item_id, attempt_id, source, child_self_report,
        previous_value, previous_observation_id, actor_id, observed_at, created_at
      ) VALUES (
        'observation-child', 'phase2b-child', 'phase2b-item', 'phase2b-attempt-1',
        'child', 'calculation_slip', 'calculation', 'observation-system',
        'phase2b-child', 56, 56
      )
    `).run();
    sqlite.prepare(`
      INSERT INTO error_observations (
        id, child_id, session_item_id, attempt_id, source, parent_correction,
        previous_value, previous_observation_id, actor_id, observed_at, created_at
      ) VALUES (
        'observation-parent', 'phase2b-child', 'phase2b-item', 'phase2b-attempt-1',
        'parent', 'incomplete_reading', 'calculation_slip', 'observation-child',
        'phase2b-parent', 57, 57
      )
    `).run();
    expect(sqlite.prepare(`
      SELECT count(*) AS count FROM error_observations
      WHERE session_item_id = 'phase2b-item'
    `).get()).toEqual({ count: 3 });

    sqlite.prepare(`
      INSERT INTO hint_events (id, child_id, session_item_id, hint_level, revealed_at)
      VALUES ('hint-1', 'phase2b-child', 'phase2b-item', 1, 61)
    `).run();
    expect(() => sqlite.prepare(`
      INSERT INTO hint_events (id, child_id, session_item_id, hint_level, revealed_at)
      VALUES ('hint-1-duplicate', 'phase2b-child', 'phase2b-item', 1, 62)
    `).run()).toThrow();
    expect(() => sqlite.prepare(`
      INSERT INTO hint_events (id, child_id, session_item_id, hint_level, revealed_at)
      VALUES ('foreign-hint', 'phase2b-child', 'missing-item', 2, 62)
    `).run()).toThrow();

    sqlite.prepare(`
      INSERT INTO session_items (
        id, session_id, question_template_id, position, stem_snapshot,
        answer_spec_snapshot, explanation_snapshot, skill_id_snapshot,
        skill_name_snapshot, difficulty_snapshot, content_tier_snapshot,
        structure_tag_snapshot, variant_seed, selection_reason_snapshot
      ) VALUES (
        'hint-only-item', 'phase2b-session', 'phase2b-question', 1, '0.8 + 0.4 = ?',
        '{"kind":"number","value":1.2,"tolerance":0,"unit":null}',
        '小数点对齐。', 'phase2b-skill', '小数计算', 2, 'core',
        'decimal-add', 'hint-only-seed', '{}'
      )
    `).run();
    sqlite.prepare(`
      INSERT INTO hint_events (id, child_id, session_item_id, hint_level, revealed_at)
      VALUES ('hint-cascade', 'phase2b-child', 'hint-only-item', 1, 63)
    `).run();
    sqlite.prepare("DELETE FROM session_items WHERE id = 'hint-only-item'").run();
    expect(sqlite.prepare("SELECT count(*) AS count FROM hint_events WHERE id = 'hint-cascade'").get())
      .toEqual({ count: 0 });

    sqlite.prepare(`
      INSERT INTO session_items (
        id, session_id, question_template_id, position, stem_snapshot,
        answer_spec_snapshot, explanation_snapshot, skill_id_snapshot,
        skill_name_snapshot, difficulty_snapshot, content_tier_snapshot,
        structure_tag_snapshot, variant_seed, selection_reason_snapshot
      ) VALUES (
        'evidence-only-item', 'phase2b-session', 'phase2b-question', 2, '0.8 + 0.4 = ?',
        '{"kind":"number","value":1.2,"tolerance":0,"unit":null}',
        '小数点对齐。', 'phase2b-skill', '小数计算', 2, 'core',
        'decimal-add', 'evidence-only-seed', '{}'
      )
    `).run();
    sqlite.prepare(`
      INSERT INTO mastery_evidence (
        id, child_id, skill_id, session_item_id, template_id, purpose, first_attempt_correct,
        independent, hint_level, difficulty, structure_tag, occurred_on, occurred_at,
        review_interval_days
      ) VALUES (
        'evidence-restrict', 'phase2b-child', 'phase2b-skill', 'evidence-only-item', 'phase2b-question',
        'review', 1, 1, 0, 2, 'decimal-add', '2026-08-19', 63, 7
      )
    `).run();
    expect(() => sqlite.prepare("DELETE FROM session_items WHERE id = 'evidence-only-item'").run())
      .toThrow();

    migrateDatabase(db, resolve(process.cwd(), "drizzle"));
    expect(sqlite.prepare("SELECT count(*) AS count FROM attempts WHERE session_item_id = 'phase2b-item'").get())
      .toEqual({ count: 2 });
    expect(sqlite.prepare("SELECT count(*) AS count FROM hint_events WHERE session_item_id = 'phase2b-item'").get())
      .toEqual({ count: 1 });
    expect(sqlite.prepare("SELECT count(*) AS count FROM hint_requests").get())
      .toEqual({ count: 0 });
    expect(foreignKeyCheck(sqlite)).toEqual([]);
  } finally {
    sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("backfills immutable template identity for already-populated mastery evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "math-trainer-evidence-template-"));
  const filename = join(directory, "before-template-id.sqlite");
  const beforeLatest = join(directory, "before-latest");
  mkdirSync(beforeLatest);
  for (const migration of [
    "20260819140335_last_mimic", "20260819151632_concerned_professor_monster",
    "20260819172252_opposite_rumiko_fujikawa", "20260820035833_phase2a_diagnosis",
    "20260820083528_phase2a_template_metadata", "20260820101400_phase2b_learning_state",
    "20260820102921_phase2b_learning_state_constraints",
  ]) cpSync(resolve(process.cwd(), "drizzle", migration), join(beforeLatest, migration), { recursive: true });
  const db = createDatabase(filename);
  const sqlite = db.$client;
  try {
    migrateDatabase(db, beforeLatest);
    sqlite.exec(`
      INSERT INTO users VALUES ('child', 'child', '孩子', 'hash', 1);
      INSERT INTO skills VALUES ('skill', 'skill', '能力', 'number_operations');
      INSERT INTO question_templates (id, skill_id, stem, answer_spec, explanation, difficulty, active)
        VALUES ('template', 'skill', '1+1=?', '{"kind":"number","value":2,"tolerance":0,"unit":null}', '2', 1, 1);
      INSERT INTO training_sessions (id, child_id, session_date, kind, status, started_at)
        VALUES ('session', 'child', '2026-08-20', 'daily', 'completed', 1);
      INSERT INTO session_items (id, session_id, question_template_id, position, stem_snapshot,
        answer_spec_snapshot, explanation_snapshot, skill_id_snapshot, skill_name_snapshot)
        VALUES ('item', 'session', 'template', 0, '1+1=?',
          '{"kind":"number","value":2,"tolerance":0,"unit":null}', '2', 'skill', '能力');
      INSERT INTO mastery_evidence (id, child_id, skill_id, session_item_id, purpose,
        first_attempt_correct, independent, difficulty, structure_tag, occurred_on, occurred_at)
        VALUES ('evidence', 'child', 'skill', 'item', 'learning', 1, 1, 1, 'sum', '2026-08-20', 2);
      INSERT INTO diagnostic_runs (id, child_id, version, status, current_part, seed, started_at, completed_at)
        VALUES ('run', 'child', 1, 'completed', 3, 'seed', 10, 1700000000000);
      INSERT INTO training_sessions (id, child_id, session_date, kind, diagnostic_run_id,
        diagnostic_part_number, status, started_at, completed_at)
        VALUES ('diagnostic-session', 'child', '2023-11-15', 'diagnostic', 'run', 1,
          'completed', 10, 20);
      INSERT INTO session_items (id, session_id, question_template_id, position, stem_snapshot,
        answer_spec_snapshot, explanation_snapshot, skill_id_snapshot, skill_name_snapshot)
        VALUES ('diagnostic-item', 'diagnostic-session', 'template', 0, '1+1=?',
          '{"kind":"number","value":2,"tolerance":0,"unit":null}', '2', 'skill', '能力');
      INSERT INTO attempts (id, session_item_id, client_submission_id, answer_text, is_correct,
        normalized_answer, explanation, session_completed, active_duration_ms, hint_level,
        hint_count, correction_number, submitted_at)
        VALUES ('attempt', 'diagnostic-item', 'submission', '2', 1, '2', '2', 1,
          1000, 1, 1, 0, 15);
      INSERT INTO mastery_evidence (id, child_id, skill_id, session_item_id, purpose,
        first_attempt_correct, independent, difficulty, structure_tag, occurred_on, occurred_at)
        VALUES ('diagnostic-evidence', 'child', 'skill', 'diagnostic-item', 'diagnostic',
          1, 0, 1, 'sum', '2023-11-15', 15);
    `);
    migrateDatabase(db, resolve(process.cwd(), "drizzle"));
    expect(sqlite.prepare(`
      SELECT template_id AS templateId, hint_level AS hintLevel, independent,
        dosage_track AS dosageTrack
      FROM mastery_evidence WHERE id='evidence'
    `).get()).toEqual({ templateId: "template", hintLevel: null, independent: 0, dosageTrack: null });
    expect(sqlite.prepare(`
      SELECT hint_level AS hintLevel, independent, diagnostic_run_id AS runId,
        dosage_track AS dosageTrack,
        diagnostic_completed_on AS completedOn, diagnostic_completed_at AS completedAt
      FROM mastery_evidence WHERE id='diagnostic-evidence'
    `).get()).toEqual({
      hintLevel: 1, independent: 0, runId: "run", dosageTrack: null,
      completedOn: "2023-11-15", completedAt: 1700000000000,
    });
    expect(foreignKeyCheck(sqlite)).toEqual([]);
  } finally {
    sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("adds versioned planning tables without changing populated Phase 2B attempts", () => {
  const directory = mkdtempSync(join(tmpdir(), "math-trainer-phase2c-schema-"));
  const filename = join(directory, "phase2b.sqlite");
  const beforePlanning = join(directory, "before-planning");
  mkdirSync(beforePlanning);
  for (const migration of [
    "20260819140335_last_mimic", "20260819151632_concerned_professor_monster",
    "20260819172252_opposite_rumiko_fujikawa", "20260820035833_phase2a_diagnosis",
    "20260820083528_phase2a_template_metadata", "20260820101400_phase2b_learning_state",
    "20260820102921_phase2b_learning_state_constraints",
    "20260820114223_phase2b_mastery_template_evidence",
    "20260820120919_phase2b_mastery_timeline", "20260822055003_charming_toxin",
  ]) cpSync(resolve(process.cwd(), "drizzle", migration), join(beforePlanning, migration), { recursive: true });
  const db = createDatabase(filename);
  const sqlite = db.$client;
  try {
    migrateDatabase(db, beforePlanning);
    sqlite.exec(`
      INSERT INTO users VALUES ('child', 'child', '孩子', 'hash', 1);
      INSERT INTO skills VALUES ('skill', 'skill', '能力', 'number_operations');
      INSERT INTO question_templates (id, skill_id, stem, answer_spec, explanation, difficulty, active)
        VALUES ('template', 'skill', '1+1=?', '{"kind":"number","value":2,"tolerance":0,"unit":null}', '2', 1, 1);
      INSERT INTO diagnostic_runs (id, child_id, version, status, current_part, seed, started_at, completed_at)
        VALUES ('run', 'child', 1, 'completed', 3, 'seed', 1, 2);
      INSERT INTO training_sessions (id, child_id, session_date, kind, rule_version, composition_snapshot, status, started_at)
        VALUES ('session', 'child', '2026-08-20', 'daily', 'phase2b', '{"legacy":true}', 'completed', 1);
      INSERT INTO session_items (id, session_id, question_template_id, position, stem_snapshot,
        answer_spec_snapshot, explanation_snapshot, skill_id_snapshot, skill_name_snapshot)
        VALUES ('item', 'session', 'template', 0, '1+1=?',
          '{"kind":"number","value":2,"tolerance":0,"unit":null}', '2', 'skill', '能力');
      INSERT INTO attempts (id, session_item_id, client_submission_id, answer_text, is_correct,
        normalized_answer, explanation, session_completed, submitted_at)
        VALUES ('attempt', 'item', 'submission', '2', 1, '2', '2', 1, 2);
    `);
    const existingAttemptCount = sqlite.prepare("SELECT count(*) AS count FROM attempts").get();

    migrateDatabase(db, resolve(process.cwd(), "drizzle"));

    expect(primaryKeyColumns(sqlite, "learning_plans")).toEqual(["id"]);
    expect(indexColumns(sqlite, "learning_plans", "learning_plan_child_version_idx"))
      .toEqual(["child_id", "version", "revision"]);
    expect(primaryKeyColumns(sqlite, "plan_targets")).toEqual(["plan_id", "week_number", "target_key"]);
    expect(primaryKeyColumns(sqlite, "parent_preferences")).toEqual(["child_id"]);
    expect(columns(sqlite, "training_sessions")).toEqual(expect.arrayContaining([
      "learning_plan_id", "plan_revision", "composition_snapshot",
    ]));
    expect(columns(sqlite, "attempts")).toContain("reading_card_response");
    expect(foreignKeyCheck(sqlite)).toEqual([]);
    expect(sqlite.prepare("SELECT count(*) AS count FROM attempts").get()).toEqual(existingAttemptCount);
    expect(sqlite.prepare(`
      SELECT composition_snapshot AS compositionSnapshot FROM training_sessions WHERE id = 'session'
    `).get()).toEqual({ compositionSnapshot: '{"legacy":true}' });

    const insertPlan = sqlite.prepare(`
      INSERT INTO learning_plans (
        id, child_id, diagnosis_run_id, version, revision, status,
        starts_on, ends_on, reason_snapshot, created_at
      ) VALUES (?, 'child', 'run', 1, ?, 'active', '2026-08-24', '2026-10-04', '{}', 3)
    `);
    insertPlan.run("plan-revision-1", 1);
    insertPlan.run("plan-revision-2", 2);
    expect(() => insertPlan.run("plan-revision-1-duplicate", 2)).toThrow();
    expect(() => sqlite.prepare(`
      INSERT INTO plan_targets (
        plan_id, week_number, target_key, category, minimum, target, maximum, reason_code
      ) VALUES ('plan-revision-1', 0, 'bad-week', 'weakness', 1, 1, 1, 'test')
    `).run()).toThrow();
    expect(() => sqlite.prepare(`
      INSERT INTO plan_targets (
        plan_id, week_number, target_key, category, minimum, target, maximum, reason_code
      ) VALUES ('plan-revision-1', 1, 'bad-range', 'weakness', 2, 1, 3, 'test')
    `).run()).toThrow();
  } finally {
    sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
