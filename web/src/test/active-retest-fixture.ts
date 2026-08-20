import { DatabaseSync } from "node:sqlite";

export const RETEST_RUN_ID = "22222222-2222-4222-8222-222222222222";
export const RETEST_SESSION_ID = "33333333-3333-4333-8333-333333333333";
const RETEST_ITEM_ID = "44444444-4444-4444-8444-444444444444";

type SeedStep = "run" | "parts" | "session" | "item";
type CleanupStep = "session" | "run";

function rollback(sqlite: DatabaseSync) {
  try {
    sqlite.exec("rollback");
  } catch {
    // Preserve the operation's original error.
  }
}

export function seedActiveRetest(sqlite: DatabaseSync, beforeStep: (step: SeedStep) => void = () => undefined) {
  sqlite.exec("begin immediate");
  try {
    const template = sqlite.prepare(`
      select qt.id, qt.stem, qt.answer_spec, qt.explanation, qt.skill_id, s.name as skill_name,
        qt.content_tier, qt.structure_tag, qt.answer_mode, qt.domain
      from question_templates qt join skills s on s.id = qt.skill_id
      where qt.active = 1 order by qt.id limit 1
    `).get() as Record<string, string> | undefined;
    if (!template) throw new Error("Active retest fixture requires one active template");

    beforeStep("run");
    sqlite.prepare("insert into diagnostic_runs (id, child_id, version, status, current_part, seed, started_at) values (?, 'child', 2, 'in_progress', 1, 'e2e-retest', 2)")
      .run(RETEST_RUN_ID);
    beforeStep("parts");
    sqlite.prepare("insert into diagnostic_parts (run_id, part_number, status, started_at) values (?, 1, 'in_progress', 2), (?, 2, 'locked', null), (?, 3, 'locked', null)")
      .run(RETEST_RUN_ID, RETEST_RUN_ID, RETEST_RUN_ID);
    beforeStep("session");
    sqlite.prepare("insert into training_sessions (id, child_id, session_date, kind, rule_version, composition_snapshot, diagnostic_run_id, diagnostic_part_number, status, started_at) values (?, 'child', '2026-08-20', 'diagnostic', 'phase2a-v1', '{}', ?, 1, 'in_progress', 2)")
      .run(RETEST_SESSION_ID, RETEST_RUN_ID);
    beforeStep("item");
    sqlite.prepare(`
      insert into session_items (
        id, session_id, question_template_id, position, stem_snapshot, answer_spec_snapshot,
        explanation_snapshot, skill_id_snapshot, skill_name_snapshot, difficulty_snapshot,
        content_tier_snapshot, structure_tag_snapshot, variant_seed, selection_reason_snapshot
      ) values (?, ?, ?, 1, ?, ?, ?, ?, ?, 2, ?, ?, 'e2e-retest', ?)
    `).run(
      RETEST_ITEM_ID, RETEST_SESSION_ID, template.id,
      template.stem, template.answer_spec, template.explanation, template.skill_id, template.skill_name,
      template.content_tier, template.structure_tag,
      JSON.stringify({ answerMode: template.answer_mode, domain: template.domain }),
    );
    sqlite.exec("commit");
  } catch (error) {
    rollback(sqlite);
    throw error;
  }
}

function assertActiveRetestRemoved(sqlite: DatabaseSync) {
  const remaining = sqlite.prepare(`
    select
      (select count(*) from attempts where session_item_id = ?) as attempts,
      (select count(*) from session_items where session_id = ?) as items,
      (select count(*) from training_sessions where id = ?) as sessions,
      (select count(*) from diagnostic_parts where run_id = ?) as parts,
      (select count(*) from diagnostic_runs where id = ?) as runs
  `).get(RETEST_ITEM_ID, RETEST_SESSION_ID, RETEST_SESSION_ID, RETEST_RUN_ID, RETEST_RUN_ID) as Record<string, number>;
  if (Object.values(remaining).some((count) => count !== 0)) {
    throw new Error(`Active retest cleanup left temporary rows: ${JSON.stringify(remaining)}`);
  }
}

function cleanupActiveRetest(sqlite: DatabaseSync, beforeStep?: (step: CleanupStep) => void) {
  sqlite.exec("begin immediate");
  try {
    let firstError: unknown;
    for (const [step, statements] of [
      ["session", [
        ["delete from attempts where session_item_id in (select id from session_items where session_id = ?)", RETEST_SESSION_ID],
        ["delete from session_items where session_id = ?", RETEST_SESSION_ID],
        ["delete from training_sessions where id = ?", RETEST_SESSION_ID],
      ]],
      ["run", [
        ["delete from diagnostic_parts where run_id = ?", RETEST_RUN_ID],
        ["delete from diagnostic_runs where id = ?", RETEST_RUN_ID],
      ]],
    ] as const) {
      try {
        beforeStep?.(step);
        for (const [statement, id] of statements) sqlite.prepare(statement).run(id);
      } catch (error) {
        firstError ??= error;
      }
    }
    if (firstError) throw firstError;
    assertActiveRetestRemoved(sqlite);
    sqlite.exec("commit");
  } catch (error) {
    rollback(sqlite);
    throw error;
  }
}

export function removeActiveRetest(sqlite: DatabaseSync, beforeStep?: (step: CleanupStep) => void) {
  try {
    cleanupActiveRetest(sqlite, beforeStep);
  } catch (originalError) {
    try {
      cleanupActiveRetest(sqlite);
    } catch (fallbackError) {
      throw new AggregateError(
        [originalError, fallbackError],
        "Active retest cleanup and fallback cleanup both failed",
      );
    }
    throw originalError;
  }
}
