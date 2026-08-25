import { DatabaseSync } from "node:sqlite";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { addShanghaiDays } from "@/domain/time/shanghai-calendar";

test.setTimeout(180_000);

function resetCleanFixture() {
  const database = new DatabaseSync(".tmp/e2e.sqlite");
  try {
    database.exec(`
      DELETE FROM error_observations WHERE child_id = 'child';
      DELETE FROM hint_requests WHERE child_id = 'child';
      DELETE FROM hint_events WHERE child_id = 'child';
      DELETE FROM mastery_evidence WHERE child_id = 'child';
      DELETE FROM attempts WHERE session_item_id IN (SELECT id FROM session_items WHERE session_id IN (SELECT id FROM training_sessions WHERE child_id = 'child'));
      DELETE FROM session_items WHERE session_id IN (SELECT id FROM training_sessions WHERE child_id = 'child');
      DELETE FROM training_sessions WHERE child_id = 'child';
      DELETE FROM plan_targets WHERE plan_id IN (SELECT id FROM learning_plans WHERE child_id = 'child');
      DELETE FROM learning_plans WHERE child_id = 'child';
      DELETE FROM diagnostic_parts WHERE run_id IN (SELECT id FROM diagnostic_runs WHERE child_id = 'child');
      DELETE FROM diagnostic_runs WHERE child_id = 'child';
      DELETE FROM parent_preferences WHERE child_id = 'child';
      DELETE FROM mastery_states WHERE child_id = 'child';
      DELETE FROM review_schedules WHERE child_id = 'child';
      DELETE FROM dosage_states WHERE child_id = 'child';
      DELETE FROM auth_sessions;
    `);
  } finally { database.close(); }
}

function prepareMigratedLegacyPresentation() {
  const database = new DatabaseSync(".tmp/e2e.sqlite");
  try {
    database.exec(`
      INSERT OR IGNORE INTO skills (id, code, name, domain) VALUES ('legacy-skill', 'legacy-skill', '旧计算', 'number_operations');
      INSERT OR IGNORE INTO question_templates (id, skill_id, domain, content_tier, structure_tag, estimated_seconds, reading_load, answer_mode, variant_spec, hint_ladder, stem, answer_spec, explanation, difficulty, active)
        VALUES ('legacy-question', 'legacy-skill', 'number_operations', 'core', 'legacy', 60, 'short', 'written', '{}', '[]', '9 + 3 = ?', '{"kind":"number","value":12,"tolerance":0,"unit":null}', '先算 9 加 3。', 2, 1);
      INSERT INTO training_sessions (id, child_id, session_date, status, started_at, completed_at, kind, rule_version, composition_snapshot)
        VALUES ('legacy-session', 'child', '2026-08-19', 'completed', 1, 2, 'daily', 'phase1', '{}');
      INSERT INTO session_items (id, session_id, question_template_id, position, stem_snapshot, answer_spec_snapshot, explanation_snapshot, skill_id_snapshot, skill_name_snapshot, difficulty_snapshot, content_tier_snapshot, structure_tag_snapshot, variant_seed, selection_reason_snapshot)
        VALUES ('legacy-item', 'legacy-session', 'legacy-question', 0, '9 + 3 = ?', '{"kind":"number","value":12,"tolerance":0,"unit":null}', '先算 9 加 3。', 'legacy-skill', '旧计算', 2, 'core', 'legacy', 'phase1', '{}');
      INSERT INTO attempts (id, session_item_id, client_submission_id, answer_text, is_correct, normalized_answer, explanation, session_completed, correction_number, submitted_at)
        VALUES ('legacy-first', 'legacy-item', 'legacy-first-submission', '11', 0, '11', '先算 9 加 3。', 0, 0, 1),
               ('legacy-correction', 'legacy-item', 'legacy-correction-submission', '12', 1, '12', '先算 9 加 3。', 1, 1, 2);
    `);
  } finally { database.close(); }
}

function currentDiagnosisAnswer() {
  const database = new DatabaseSync(".tmp/e2e.sqlite", { readOnly: true });
  try {
    const row = database.prepare(`
      SELECT si.answer_spec_snapshot AS answer_spec
      FROM session_items si
      JOIN training_sessions ts ON ts.id = si.session_id
      JOIN diagnostic_runs dr ON dr.id = ts.diagnostic_run_id
      WHERE dr.status = 'in_progress'
        AND NOT EXISTS (SELECT 1 FROM attempts a WHERE a.session_item_id = si.id)
      ORDER BY ts.diagnostic_part_number, si.position
      LIMIT 1
    `).get() as { answer_spec: string } | undefined;
    if (!row) throw new Error("The diagnosis fixture has no persisted slot");
    const answer = JSON.parse(row.answer_spec) as { kind: "choice"; value: string } | { kind: "number"; value: number; unit: string | null };
    return answer.kind === "choice" ? answer.value : `${answer.value}${answer.unit ?? ""}`;
  } finally {
    database.close();
  }
}

function todayInShanghai() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts();
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((value) => value.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function prepareSchedulerInputs() {
  const database = new DatabaseSync(".tmp/e2e.sqlite");
  try {
    const plan = database.prepare("SELECT id FROM learning_plans WHERE child_id = 'child' AND status = 'active'").get() as { id: string } | undefined;
    if (!plan) throw new Error("The completed diagnosis did not create an active plan");
    const equation = database.prepare("SELECT skill_id AS skillId FROM question_templates WHERE id = 'eq-l1-balance-01'").get() as { skillId: string };
    const unit = database.prepare("SELECT skill_id AS skillId FROM question_templates WHERE id = 'habit-unit-02'").get() as { skillId: string };
    database.prepare(`INSERT INTO plan_targets (plan_id, week_number, target_key, skill_id, track, category, minimum, target, maximum, reason_code)
      VALUES ($plan, 1, 'acceptance-equation', $equation, 'equation', 'weakness', 1, 2, 3, 'acceptance')`).run({ plan: plan.id, equation: equation.skillId });
    database.prepare(`INSERT INTO review_schedules (child_id, skill_id, level, due_on, last_result, updated_at)
      VALUES ('child', $skill, 0, '2026-08-24', NULL, 1)
      ON CONFLICT(child_id, skill_id) DO UPDATE SET due_on = excluded.due_on, level = excluded.level, updated_at = excluded.updated_at`).run({ skill: unit.skillId });
  } finally {
    database.close();
  }
}

function currentDailyItem() {
  const database = new DatabaseSync(".tmp/e2e.sqlite", { readOnly: true });
  try {
    return database.prepare(`SELECT si.question_template_id AS template, si.answer_spec_snapshot AS answer_spec, si.selection_reason_snapshot AS metadata
      FROM session_items si JOIN training_sessions ts ON ts.id = si.session_id
      WHERE ts.child_id = 'child' AND ts.session_date = $date
      AND NOT EXISTS (SELECT 1 FROM attempts WHERE session_item_id = si.id) ORDER BY si.position LIMIT 1`).get({ date: todayInShanghai() }) as { template: string; answer_spec: string; metadata: string } | undefined;
  } finally { database.close(); }
}

function answerText(answerSpec: string, omitUnit = false) {
  const answer = JSON.parse(answerSpec) as { kind: "choice"; value: string } | { kind: "number"; value: number; unit: string | null };
  return answer.kind === "choice" ? answer.value : `${answer.value}${omitUnit ? "" : answer.unit ?? ""}`;
}

async function completeReadingCard(page: Page) {
  await expect(page.getByRole("button", { name: "提交答案" })).toBeEnabled();
  for (const label of ["题目要我求什么", "已知了什么", "单位是什么", "哪些信息有用", "数量之间有什么关系", "答案大约在哪个范围"]) {
    const input = page.getByLabel(label);
    await input.fill("已填写");
    await expect(input).toHaveValue("已填写");
  }
}

async function answerDiagnosis(page: Page) {
  const answer = currentDiagnosisAnswer();
  const choice = page.getByRole("button", { name: new RegExp(`^${answer}\\.`) });
  if (await choice.count()) await choice.click();
  else await page.getByLabel("你的答案").fill(answer);
  await page.getByRole("button", { name: "提交答案" }).click();
  await page.getByRole("button", { name: /下一题|查看完成/ }).click();
  await expect(page.getByRole("heading", { name: "这题已记录" })).toBeHidden();
}

test("@tablet @parent @phase2 adaptive child route creates a scheduler snapshot", async ({ page }) => runAdaptiveChildRouteScenario(page));
test("@parent @phase2 migrated Phase 1 correction remains visible and child starts diagnosis", async ({ page, context }) => runMigratedPhase1Scenario(page, context));

test("@tablet @parent @phase2 @full-diagnosis phase 2 creates a plan after a resumed 45-slot diagnosis", async ({ page }) => {
  resetCleanFixture();
  await page.goto("/login");
  await page.getByRole("button", { name: /我是孩子/ }).click();
  await page.getByLabel("PIN").fill("2468");
  await Promise.all([
    page.waitForURL("**/child"),
    page.getByRole("button", { name: "登录", exact: true }).click(),
  ]);
  await page.getByRole("link", { name: "继续初始诊断" }).click();

  await answerDiagnosis(page);
  const resumedStem = await page.getByRole("heading", { level: 1 }).innerText();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: resumedStem })).toBeVisible();

  for (let slot = 1; slot < 45; slot += 1) await answerDiagnosis(page);
  await expect(page.getByRole("heading", { name: "三部分都完成了" })).toBeVisible();

  const database = new DatabaseSync(".tmp/e2e.sqlite", { readOnly: true });
  try {
    expect(database.prepare("SELECT count(*) AS value FROM learning_plans WHERE child_id = 'child' AND version = 1 AND revision = 1").get())
      .toEqual({ value: 1 });
  } finally {
    database.close();
  }

  prepareSchedulerInputs();
  await page.goto("/child");
  await page.getByRole("link", { name: /开始今天的训练/ }).click();
  await expect(page.getByRole("navigation", { name: "今天的训练进度" }).getByText("旧知识唤醒")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "今天的训练进度" }).getByText("核心练习")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "今天的训练进度" }).getByText("审题专项")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "今天的训练进度" }).getByText("订正回看")).toBeVisible();

  const scheduled = new DatabaseSync(".tmp/e2e.sqlite", { readOnly: true });
  try {
    const session = scheduled.prepare("SELECT composition_snapshot AS composition, target_seconds AS target FROM training_sessions WHERE child_id = 'child' AND session_date = $date AND kind = 'daily'").get({ date: todayInShanghai() }) as { composition: string; target: number };
    const items = scheduled.prepare("SELECT question_template_id AS template, structure_tag_snapshot AS structure, selection_reason_snapshot AS reason FROM session_items WHERE session_id = (SELECT id FROM training_sessions WHERE child_id = 'child' AND session_date = $date AND kind = 'daily')").all({ date: todayInShanghai() }) as Array<{ template: string; structure: string; reason: string }>;
    const composition = JSON.parse(session.composition);
    expect(composition.composition).toEqual({ review: 3, weakness: 6, reading: 3, extension: 1 });
    expect(items.every(({ reason }) => "selectionReason" in JSON.parse(reason))).toBe(true);
    expect(new Set(items.map(({ template }) => template)).size).toBe(items.length);
    const structureCounts = items.reduce<Record<string, number>>((counts, { structure }) => ({ ...counts, [structure]: (counts[structure] ?? 0) + 1 }), {});
    expect(Math.max(...Object.values(structureCounts))).toBeLessThanOrEqual(6);
    expect(session.target).toBe(1200);
  } finally { scheduled.close(); }
  let usedHint = false; let reflected = false; let equationDue: string | null = null; let usedReadingCard = false;
  while (currentDailyItem()) {
    const item = currentDailyItem()!;
    const metadata = JSON.parse(item.metadata) as { readingCard?: boolean };
    if (metadata.readingCard) { await completeReadingCard(page); usedReadingCard = true; }
    const isUnit = item.template === "habit-unit-02";
    if (isUnit && !usedHint) {
      await page.getByRole("button", { name: "查看提示" }).click();
      await expect(page.getByText("提示 1：")).toBeVisible();
      await page.getByLabel("你的答案").fill(answerText(item.answer_spec, true));
      await page.getByRole("button", { name: "提交答案" }).click();
      await expect(page.getByRole("heading", { name: "再看一步" })).toBeVisible();
      await expect(page.getByRole("heading", { name: /全长是多少米？请写单位。/ })).toBeVisible();
      await expect(page.getByText(/先把厘米信息换算成米，再相加；单位统一后的数量关系得到/)).toBeVisible();
      const errors = new DatabaseSync(".tmp/e2e.sqlite", { readOnly: true });
      try {
        expect(errors.prepare(`SELECT system_candidate AS candidate FROM error_observations
          WHERE session_item_id = (SELECT si.id FROM session_items si JOIN training_sessions ts ON ts.id = si.session_id
            WHERE si.question_template_id = $template AND ts.child_id = 'child' AND ts.kind = 'daily' LIMIT 1)
          ORDER BY observed_at DESC LIMIT 1`).get({ template: item.template })).toEqual({ candidate: "missing_unit" });
      } finally { errors.close(); }
      await page.getByRole("button", { name: "修改答案" }).click();
      if (metadata.readingCard) await completeReadingCard(page);
      await page.getByLabel("你的答案").fill(answerText(item.answer_spec));
      await page.getByRole("button", { name: "提交答案" }).click();
      await page.getByRole("button", { name: "漏了条件或单位" }).click();
      reflected = true; usedHint = true;
    } else {
      await page.getByLabel("你的答案").fill(answerText(item.answer_spec));
      await page.getByRole("button", { name: "提交答案" }).click();
    }
    if (item.template.startsWith("eq-")) {
      const review = new DatabaseSync(".tmp/e2e.sqlite", { readOnly: true });
      try { equationDue = (review.prepare("SELECT due_on AS dueOn FROM review_schedules WHERE child_id = 'child' AND skill_id = (SELECT skill_id_snapshot FROM session_items WHERE question_template_id = $template LIMIT 1)").get({ template: item.template }) as { dueOn: string }).dueOn; } finally { review.close(); }
    }
    await page.getByRole("button", { name: "下一题" }).click();
  }
  expect(usedHint).toBe(true); expect(reflected).toBe(true); expect(usedReadingCard).toBe(true); expect(equationDue).toBe(addShanghaiDays(todayInShanghai(), 7));
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByRole("button", { name: /我是家长/ }).click();
  await page.getByLabel("家长密码").fill("parent-test-1234");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByRole("heading", { name: "六周训练计划" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "本周学习报告" })).toContainText("本周学习报告");
  await page.getByLabel("重点方向").selectOption("equation");
  await page.getByRole("button", { name: "保存并更新计划" }).click();
  await expect(page.getByText(/第 1 版 · 修订 2/)).toBeVisible();
  const historical = new DatabaseSync(".tmp/e2e.sqlite", { readOnly: true });
  try { expect(historical.prepare("SELECT plan_revision AS revision FROM training_sessions WHERE child_id = 'child' AND session_date = $date AND kind = 'daily'").get({ date: todayInShanghai() })).toEqual({ revision: 1 }); } finally { historical.close(); }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1180, height: 820 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

async function runMigratedPhase1Scenario(page: Page, context: BrowserContext) {
  resetCleanFixture();
  prepareMigratedLegacyPresentation();
  await page.goto("/login");
  await page.getByRole("button", { name: /我是孩子/ }).click();
  await page.getByLabel("PIN").fill("2468");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByRole("link", { name: "继续初始诊断" })).toBeVisible();
  await context.clearCookies();
  await page.goto("/login");
  await page.getByRole("button", { name: /我是家长/ }).click();
  await page.getByLabel("家长密码").fill("parent-test-1234");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  const evidence = page.getByRole("region", { name: "最近作答" });
  await expect(evidence.getByText("9 + 3 = ?").first()).toBeVisible();
  await expect(evidence.getByText("11", { exact: true })).toBeVisible();
  await expect(evidence.getByText("12", { exact: true })).toBeVisible();
}

async function runAdaptiveChildRouteScenario(page: Page) {
  resetCleanFixture();
  const database = new DatabaseSync(".tmp/e2e.sqlite");
  try {
    database.exec(`
      INSERT INTO diagnostic_runs (id, child_id, version, status, current_part, seed, report_snapshot, started_at, completed_at)
        VALUES ('adaptive-diagnosis', 'child', 1, 'completed', 3, 'adaptive', '{}', 1, 2);
      INSERT INTO learning_plans (id, child_id, diagnosis_run_id, version, revision, status, starts_on, ends_on, reason_snapshot, created_at)
        VALUES ('adaptive-plan', 'child', 'adaptive-diagnosis', 1, 1, 'active', '2026-08-24', '2026-10-04', '{}', 2);
      INSERT INTO parent_preferences VALUES ('child', '[1,2,3,4,5]', 20, 'equation', 2);
    `);
  } finally { database.close(); }
  await page.goto("/login");
  await page.getByRole("button", { name: /我是孩子/ }).click();
  await page.getByLabel("PIN").fill("2468");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.getByRole("link", { name: /开始今天的训练/ }).click();
  const snapshot = new DatabaseSync(".tmp/e2e.sqlite", { readOnly: true });
  try {
    const session = snapshot.prepare("SELECT composition_snapshot AS composition, rule_version AS ruleVersion FROM training_sessions WHERE child_id = 'child' ORDER BY started_at DESC LIMIT 1").get() as { composition: string; ruleVersion: string };
    const reasons = snapshot.prepare("SELECT selection_reason_snapshot AS reason FROM session_items WHERE session_id = (SELECT id FROM training_sessions WHERE child_id = 'child' ORDER BY started_at DESC LIMIT 1)").all() as Array<{ reason: string }>;
    expect(session.ruleVersion).toBe("phase2c-v1");
    expect(JSON.parse(session.composition)).toMatchObject({ composition: expect.any(Object), shortages: expect.any(Object) });
    expect(reasons.length).toBeGreaterThan(0);
    expect(reasons.every(({ reason }) => "selectionReason" in JSON.parse(reason))).toBe(true);
  } finally { snapshot.close(); }
}
