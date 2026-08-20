import { DatabaseSync } from "node:sqlite";
import {
  removeActiveRetest,
  RETEST_RUN_ID,
  RETEST_SESSION_ID,
  seedActiveRetest,
} from "./active-retest-fixture";

function fixtureDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    pragma foreign_keys = on;
    create table question_templates (
      id text primary key, stem text, answer_spec text, explanation text, skill_id text,
      content_tier text, structure_tag text, answer_mode text, domain text, active integer
    );
    create table skills (id text primary key, name text);
    create table diagnostic_runs (id text primary key, child_id text, version integer, status text, current_part integer, seed text, started_at integer);
    create table diagnostic_parts (run_id text references diagnostic_runs(id), part_number integer, status text, started_at integer);
    create table training_sessions (
      id text primary key, child_id text, session_date text, kind text, rule_version text,
      composition_snapshot text, diagnostic_run_id text references diagnostic_runs(id),
      diagnostic_part_number integer, status text, started_at integer
    );
    create table session_items (
      id text primary key, session_id text references training_sessions(id), question_template_id text,
      position integer, stem_snapshot text, answer_spec_snapshot text, explanation_snapshot text,
      skill_id_snapshot text, skill_name_snapshot text, difficulty_snapshot integer,
      content_tier_snapshot text, structure_tag_snapshot text, variant_seed text, selection_reason_snapshot text
    );
    insert into skills values ('skill-1', '技能');
    insert into question_templates values ('template-1', '1 + 1 = ?', '{"kind":"number","value":2,"tolerance":0,"unit":null}', '相加', 'skill-1', 'core', 'addition', 'written', 'number_operations', 1);
  `);
  return sqlite;
}

test("rolls back every retest row when seeding fails partway", () => {
  const sqlite = fixtureDatabase();
  expect(() => seedActiveRetest(sqlite, (step) => {
    if (step === "session") throw new Error("injected seed failure");
  })).toThrow("injected seed failure");

  expect(sqlite.prepare("select count(*) as count from diagnostic_runs").get()).toEqual({ count: 0 });
  expect(sqlite.prepare("select count(*) as count from diagnostic_parts").get()).toEqual({ count: 0 });
  expect(sqlite.prepare("select count(*) as count from training_sessions").get()).toEqual({ count: 0 });
  sqlite.close();
});

test("attempts every cleanup step and rolls back when one fails", () => {
  const sqlite = fixtureDatabase();
  seedActiveRetest(sqlite);
  const attempted: string[] = [];

  expect(() => removeActiveRetest(sqlite, (step) => {
    attempted.push(step);
    if (step === "session") throw new Error("injected cleanup failure");
  })).toThrow("injected cleanup failure");

  expect(attempted).toEqual(["session", "run"]);
  expect(sqlite.prepare("select id from diagnostic_runs").get()).toEqual({ id: RETEST_RUN_ID });
  expect(sqlite.prepare("select id from training_sessions").get()).toEqual({ id: RETEST_SESSION_ID });
  sqlite.close();
});
