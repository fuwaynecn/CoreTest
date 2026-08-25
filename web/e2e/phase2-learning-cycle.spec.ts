import { DatabaseSync } from "node:sqlite";
import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";

test.setTimeout(180_000);

function seedFixture(script: string) {
  execFileSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", script], {
    cwd: process.cwd(),
    env: { ...process.env, DB_FILE_NAME: ".tmp/e2e.sqlite", PARENT_PASSWORD: "parent-test-1234", CHILD_PIN: "2468" },
  });
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

function prepareAdaptiveDailyFixture() {
  const database = new DatabaseSync(".tmp/e2e.sqlite");
  const sessionId = "phase2-cycle-session";
  try {
    const plan = database.prepare("SELECT id FROM learning_plans WHERE child_id = 'child' AND status = 'active'").get() as { id: string } | undefined;
    if (!plan) throw new Error("The completed diagnosis did not create an active plan");
    database.prepare(`INSERT INTO training_sessions (id, child_id, session_date, status, started_at, kind, rule_version, target_seconds, composition_snapshot, learning_plan_id, plan_revision)
      VALUES ($id, 'child', $date, 'in_progress', 1, 'daily', 'phase2c-v1', 1200, '{"warmup":1,"core":1,"reading":1,"correction":1}', $plan, 1)`).run({ id: sessionId, date: todayInShanghai(), plan: plan.id });
    for (const [position, id, template, category] of [
      [0, "cycle-review", "q-decimal-1", "review"], [1, "cycle-unit", "q-reading-1", "weakness"],
      [2, "cycle-equation", "q-equation-1", "reading"], [3, "cycle-correction", "q-decimal-1", "correction"],
    ] as const) {
      database.prepare(`INSERT INTO session_items (id, session_id, question_template_id, position, stem_snapshot, answer_spec_snapshot, explanation_snapshot, skill_id_snapshot, skill_name_snapshot, difficulty_snapshot, content_tier_snapshot, structure_tag_snapshot, variant_seed, selection_reason_snapshot)
        SELECT $id, $session, q.id, $position, q.stem, q.answer_spec, q.explanation, q.skill_id, s.name, q.difficulty, q.content_tier, q.structure_tag, 'phase2-cycle', $metadata
        FROM question_templates q JOIN skills s ON s.id = q.skill_id WHERE q.id = $template`).run({ id, session: sessionId, position, template, metadata: JSON.stringify({ category, selectionReason: "acceptance", estimatedSeconds: 60, hintLadder: ["先看单位"], readingCard: false, reviewIntervalDays: 1 }) });
    }
  } finally {
    database.close();
  }
}

function currentDailyAnswer() {
  const database = new DatabaseSync(".tmp/e2e.sqlite", { readOnly: true });
  try {
    const row = database.prepare(`SELECT answer_spec_snapshot AS answer_spec FROM session_items WHERE session_id = 'phase2-cycle-session'
      AND NOT EXISTS (SELECT 1 FROM attempts WHERE session_item_id = session_items.id) ORDER BY position LIMIT 1`).get() as { answer_spec: string };
    const answer = JSON.parse(row.answer_spec) as { kind: "number"; value: number; unit: string | null };
    return `${answer.value}${answer.unit ?? ""}`;
  } finally { database.close(); }
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

test("@tablet @parent @full-diagnosis phase 2 creates a plan after a resumed 45-slot diagnosis", async ({ page }) => {
  seedFixture("scripts/seed-e2e.ts");
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

  prepareAdaptiveDailyFixture();
  await page.goto("/child");
  await page.getByRole("link", { name: /开始今天的训练/ }).click();
  await expect(page.getByRole("navigation", { name: "今天的训练进度" }).getByText("旧知识唤醒")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "今天的训练进度" }).getByText("核心练习")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "今天的训练进度" }).getByText("审题专项")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "今天的训练进度" }).getByText("订正回看")).toBeVisible();

  await page.getByLabel("你的答案").fill(currentDailyAnswer());
  await page.getByRole("button", { name: "提交答案" }).click();
  await page.getByRole("button", { name: "下一题" }).click();
  await page.getByRole("button", { name: "查看提示" }).click();
  await expect(page.getByText("提示 1：")).toBeVisible();
  await page.getByLabel("你的答案").fill("7.5");
  await page.getByRole("button", { name: "提交答案" }).click();
  await expect(page.getByText(/必须带单位/)).toBeVisible();
  await page.getByRole("button", { name: "修改答案" }).click();
  await page.getByLabel("你的答案").fill(currentDailyAnswer());
  await page.getByRole("button", { name: "提交答案" }).click();
  await page.getByRole("button", { name: "漏了条件或单位" }).click();
  await page.getByRole("button", { name: "下一题" }).click();
  await page.getByLabel("你的答案").fill(currentDailyAnswer());
  await page.getByRole("button", { name: "提交答案" }).click();
  await page.getByRole("button", { name: "下一题" }).click();
  const review = new DatabaseSync(".tmp/e2e.sqlite", { readOnly: true });
  try { expect(review.prepare("SELECT due_on AS dueOn FROM review_schedules WHERE child_id = 'child' AND skill_id = 'skill-equation'").get()).toMatchObject({ dueOn: expect.stringMatching(/^\\d{4}-\\d{2}-\\d{2}$/) }); } finally { review.close(); }
  await page.getByLabel("你的答案").fill(currentDailyAnswer());
  await page.getByRole("button", { name: "提交答案" }).click();
  await page.getByRole("button", { name: "下一题" }).click();
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
  try { expect(historical.prepare("SELECT plan_revision AS revision FROM training_sessions WHERE id = 'phase2-cycle-session'").get()).toEqual({ revision: 1 }); } finally { historical.close(); }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1180, height: 820 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("@parent migrated Phase 1 correction remains visible and child starts diagnosis", async ({ page, context }) => {
  seedFixture("scripts/seed-phase1-migration-fixture.ts");
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
  await expect(evidence.getByText("9 + 3 = ?")).toBeVisible();
  await expect(evidence.getByText("11", { exact: true })).toBeVisible();
  await expect(evidence.getByText("12", { exact: true })).toBeVisible();
});

test("@tablet @parent adaptive child route creates a scheduler snapshot", async ({ page }) => {
  seedFixture("scripts/seed-e2e.ts");
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
});
