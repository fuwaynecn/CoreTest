import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createDatabase } from "@/db/client";
import { migrateDatabase } from "@/db/migrate";
import { seedDatabase } from "@/db/seed";

const expectedDatabaseName = ".tmp/e2e.sqlite";
const phase1Migrations = [
  "20260819140335_last_mimic",
  "20260819151632_concerned_professor_monster",
  "20260819172252_opposite_rumiko_fujikawa",
];

export async function seedMigratedE2eDatabase() {
  if (process.env.DB_FILE_NAME !== expectedDatabaseName) throw new Error(`E2E seed requires DB_FILE_NAME=${expectedDatabaseName}`);
  const parentPassword = process.env.PARENT_PASSWORD;
  const childPin = process.env.CHILD_PIN;
  if (!parentPassword || !childPin) throw new Error("PARENT_PASSWORD and CHILD_PIN must both be set");

  const workingDirectory = process.cwd();
  const databasePath = path.resolve(workingDirectory, expectedDatabaseName);
  const expectedPath = path.resolve(workingDirectory, ".tmp", "e2e.sqlite");
  if (databasePath !== expectedPath) throw new Error("Unexpected E2E database path");
  rmSync(databasePath, { force: true });

  const legacyDirectory = mkdtempSync(path.join(tmpdir(), "math-trainer-phase1-e2e-"));
  const migrationsDirectory = path.join(legacyDirectory, "migrations");
  mkdirSync(migrationsDirectory);
  for (const migration of phase1Migrations) cpSync(path.join(workingDirectory, "drizzle", migration), path.join(migrationsDirectory, migration), { recursive: true });

  const db = createDatabase(databasePath);
  try {
    migrateDatabase(db, migrationsDirectory);
    db.$client.exec(`
      INSERT INTO users VALUES ('parent', 'parent', '家长', 'legacy', 1);
      INSERT INTO users VALUES ('child', 'child', '孩子', 'legacy', 1);
      INSERT INTO skills VALUES ('phase1-skill', 'phase1-skill', '旧计算', '数与运算');
      INSERT INTO question_templates VALUES ('phase1-question', 'phase1-skill', '9 + 3 = ?', '{"kind":"number","value":12,"tolerance":0,"unit":null}', '先算 9 加 3。', 2, 1);
      INSERT INTO training_sessions VALUES ('phase1-corrected-session', 'child', '2026-08-19', 'completed', 1, 2);
      INSERT INTO session_items (id, session_id, question_template_id, position, stem_snapshot, answer_spec_snapshot, explanation_snapshot, skill_id_snapshot, skill_name_snapshot)
        VALUES ('phase1-corrected-item', 'phase1-corrected-session', 'phase1-question', 0, '9 + 3 = ?', '{"kind":"number","value":12,"tolerance":0,"unit":null}', '先算 9 加 3。', 'phase1-skill', '旧计算');
      INSERT INTO attempts (id, session_item_id, client_submission_id, answer_text, is_correct, normalized_answer, explanation, session_completed, submitted_at)
        VALUES ('phase1-first-attempt', 'phase1-corrected-item', 'phase1-first-submission', '11', 0, '11', '先算 9 加 3。', 1, 1);
    `);
    migrateDatabase(db, path.join(workingDirectory, "drizzle"));
    db.$client.prepare(`INSERT INTO attempts (id, session_item_id, client_submission_id, answer_text, is_correct, normalized_answer, explanation, session_completed, correction_number, submitted_at)
      VALUES ('phase1-correction', 'phase1-corrected-item', 'phase1-correction-submission', '12', 1, '12', '先算 9 加 3。', 1, 1, 2)`).run();
    await seedDatabase({ parentPassword, childPin, openDatabase: () => db });
  } finally {
    db.$client.close();
    rmSync(legacyDirectory, { recursive: true, force: true });
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  seedMigratedE2eDatabase().catch((error: unknown) => {
    process.stderr.write(`Migrated E2E seed failed: ${error instanceof Error ? error.message : "Unknown error"}\n`);
    process.exitCode = 1;
  });
}
