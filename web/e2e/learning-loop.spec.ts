import { DatabaseSync } from "node:sqlite";
import { expect, test } from "@playwright/test";
import { addShanghaiDays, shanghaiWeekKey } from "@/domain/time/shanghai-calendar";

test.setTimeout(60_000);

function todayInShanghai() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts();
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((value) => value.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function firstDailyReviewItem() {
  const database = new DatabaseSync(".tmp/e2e.sqlite", { readOnly: true });
  try {
    const row = database.prepare(`SELECT si.question_instance_id AS questionInstanceId,
        si.question_template_id AS templateId,
        si.stem_snapshot AS stemSnapshot, si.answer_spec_snapshot AS answerSpec,
        si.skill_id_snapshot AS skillIdSnapshot, si.selection_reason_snapshot AS selectionReasonSnapshot
      FROM session_items si JOIN training_sessions ts ON ts.id = si.session_id
      WHERE ts.child_id = 'child' AND ts.session_date = $date AND ts.kind IN ('daily', 'assessment')
      ORDER BY si.position LIMIT 1`).get({ date: todayInShanghai() }) as { answerSpec: string } | undefined;
    if (!row) throw new Error("The daily session has no first item");
    return row as {
      questionInstanceId: string | null;
      templateId: string;
      stemSnapshot: string;
      answerSpec: string;
      skillIdSnapshot: string;
      selectionReasonSnapshot: string;
    };
  } finally {
    database.close();
  }
}

function questionBankRowIndex(questionInstanceId: string) {
  const database = new DatabaseSync(".tmp/e2e.sqlite", { readOnly: true });
  try {
    const rows = database.prepare(`SELECT question_instances.id AS id
      FROM question_instances
      JOIN question_templates ON question_templates.id = question_instances.template_id
      JOIN skills ON skills.id = question_instances.skill_id
      ORDER BY question_instances.active DESC, skills.code ASC, question_instances.difficulty ASC,
        question_instances.stem ASC, question_instances.id ASC LIMIT 100`).all() as Array<{ id: string }>;
    const index = rows.findIndex((row) => row.id === questionInstanceId);
    if (index < 0) throw new Error("The refreshed question instance is not in the parent bank");
    return index;
  } finally {
    database.close();
  }
}

function prepareCompletedReviewFixture() {
  const database = new DatabaseSync(".tmp/e2e.sqlite");
  try {
    const now = Date.now();
    const startsOn = shanghaiWeekKey(new Date());
    const endsOn = addShanghaiDays(startsOn, 41);
    database.exec(`
      INSERT INTO diagnostic_runs (id, child_id, version, status, current_part, seed, report_snapshot, started_at, completed_at)
        VALUES ('e2e-diagnosis', 'child', 1, 'completed', 3, 'e2e', '{"skills":[],"domains":[]}', ${now - 1}, ${now});
      INSERT INTO diagnostic_parts (run_id, part_number, status, started_at, completed_at) VALUES
        ('e2e-diagnosis', 1, 'completed', ${now - 1}, ${now}),
        ('e2e-diagnosis', 2, 'completed', ${now - 1}, ${now}),
        ('e2e-diagnosis', 3, 'completed', ${now - 1}, ${now});
      INSERT INTO parent_preferences (child_id, training_weekdays, target_minutes, specialist_focus, updated_at)
        VALUES ('child', '[1,2,3,4,5]', 20, 'equation', ${now});
      INSERT INTO learning_plans (id, child_id, diagnosis_run_id, version, revision, status, starts_on, ends_on, reason_snapshot, created_at)
        VALUES ('e2e-plan', 'child', 'e2e-diagnosis', 1, 1, 'active', '${startsOn}', '${endsOn}', '{"source":"e2e"}', ${now});
      INSERT INTO plan_targets (plan_id, week_number, target_key, skill_id, track, category, minimum, target, maximum, reason_code)
        VALUES ('e2e-plan', 1, 'review:skill-equation-l1', 'skill-equation-l1', 'equation', 'review', 1, 1, 2, 'due_review');
      UPDATE question_templates SET active = CASE WHEN id = 'eq-l1-balance-01' THEN 1 ELSE 0 END;
    `);
  } finally {
    database.close();
  }
}

function cleanupReviewFixture() {
  const database = new DatabaseSync(".tmp/e2e.sqlite");
  try {
    database.exec(`
      DELETE FROM reward_events WHERE child_id = 'child';
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
      DELETE FROM review_schedules WHERE child_id = 'child';
      DELETE FROM question_instances;
      DELETE FROM question_bank_refreshes;
      DELETE FROM auth_sessions;
    `);
  } finally {
    database.close();
  }
}

test("@phase2 overdue equation review refreshes, edits, and preserves evidence", async ({ page }) => {
  const before = new DatabaseSync(".tmp/e2e.sqlite", { readOnly: true });
  try {
    expect(before.prepare("SELECT count(*) AS count FROM question_instances WHERE skill_id = 'skill-equation-l1'").get()).toEqual({ count: 0 });
  } finally {
    before.close();
  }
  prepareCompletedReviewFixture();
  try {
    await page.goto("/login");
    await page.getByRole("button", { name: /我是孩子/ }).click();
    await page.getByLabel("PIN").fill("2468");
    await Promise.all([
      page.waitForURL("**/child"),
      page.getByRole("button", { name: "登录", exact: true }).click(),
    ]);
    await Promise.all([
      page.waitForURL("**/child/session/**"),
      page.getByRole("link", { name: /开始今天的训练/ }).click(),
    ]);

    const reviewItem = firstDailyReviewItem();
    const selectionReason = JSON.parse(reviewItem.selectionReasonSnapshot) as { selectionReason?: string };
    expect(selectionReason.selectionReason).toBe("overdue_review");
    expect(reviewItem.skillIdSnapshot).toBe("skill-equation-l1");
    expect(reviewItem.templateId).toBe("eq-l1-balance-01");
    expect(reviewItem.questionInstanceId).toEqual(expect.any(String));
    if (!reviewItem.questionInstanceId) throw new Error("The review item has no question instance");
    const questionInstanceId = reviewItem.questionInstanceId;
    const database = new DatabaseSync(".tmp/e2e.sqlite", { readOnly: true });
    try {
      expect(database.prepare(`SELECT id, skill_id AS skillId, active FROM question_instances WHERE id = $id`).get({ id: questionInstanceId }))
        .toMatchObject({ id: questionInstanceId, skillId: "skill-equation-l1", active: 1 });
    } finally {
      database.close();
    }

    const originalStem = reviewItem.stemSnapshot;
    await expect(page.locator("#question-heading")).toHaveText(originalStem);
    expect(originalStem).toContain("x");
    expect(originalStem).not.toContain("一级方程");
    const answer = JSON.parse(reviewItem.answerSpec) as { kind: "number" | "choice"; value: number | string };
    await page.getByLabel("你的答案").fill(String(answer.value));
    await page.getByRole("button", { name: "提交答案" }).click();
    await expect(page.getByText("做对了，别忘了检查题目问的是什么。")).toBeVisible();

    await page.context().clearCookies();
    await page.goto("/login");
    await page.getByRole("button", { name: /我是家长/ }).click();
    await page.getByLabel("家长密码").fill("parent-test-1234");
    await Promise.all([
      page.waitForURL("**/parent"),
      page.getByRole("button", { name: "登录", exact: true }).click(),
    ]);
    await page.goto("/parent/questions");
    const row = page.getByTestId("question-bank-item").nth(questionBankRowIndex(questionInstanceId));
    await expect(row).toContainText(originalStem);
    await row.locator("summary").click();
    const edited = { stem: "解方程：x + 6 = 17。", answer: "11" };
    const editedStem = edited.stem;
    await row.getByLabel("题干").fill(editedStem);
    await row.getByLabel("正确答案").fill(edited.answer);
    const saveRequest = page.waitForRequest((request) => {
      if (request.method() !== "PATCH") return false;
      return new URL(request.url()).pathname === `/api/parent/questions/${questionInstanceId}`;
    });
    const saveResponse = page.waitForResponse((response) => response.request().method() === "PATCH"
      && new URL(response.url()).pathname === `/api/parent/questions/${questionInstanceId}`);
    const [, response] = await Promise.all([
      saveRequest,
      saveResponse,
      row.getByRole("button", { name: "保存", exact: true }).click(),
    ]);
    expect(response.status()).toBe(200);
    const editedRow = page.getByTestId("question-bank-item").filter({ hasText: editedStem });
    await expect(editedRow).toHaveCount(1);

    await page.goto("/parent");
    const evidence = page.getByRole("region", { name: "最近作答" });
    await expect(evidence.getByText(originalStem, { exact: true })).toBeVisible();
    await expect(evidence.getByText(editedStem, { exact: true })).toBeHidden();
    for (const width of [390, 1024]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  } finally {
    cleanupReviewFixture();
  }
});

test("@parent parent sees the supporting evidence", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /我是家长/ }).click();
  await page.getByLabel("家长密码").fill("parent-test-1234");
  await Promise.all([
    page.waitForURL("**/parent"),
    page.getByRole("button", { name: "登录", exact: true }).click(),
  ]);

  await expect(page.getByRole("heading", { name: "孩子的学习证据" })).toBeVisible();
  await expect(page.getByText("首次作答证据")).toBeVisible();
  await expect(page.getByText("累计首次作答", { exact: true })).toBeVisible();
  const cumulativeMetric = page.getByRole("definition").filter({ hasText: "累计首次答对率" });
  await expect(cumulativeMetric).toContainText("3 次");
  await expect(cumulativeMetric).toContainText("累计首次答对率 67%");
  const recentEvidence = page.getByRole("region", { name: "最近作答" });
  await expect(recentEvidence.getByText("每盒彩笔 7.5 元，买 1 盒需要付多少钱？请写单位。").first()).toBeVisible();
  await expect(recentEvidence.getByText("7.5", { exact: true })).toBeVisible();
  await expect(recentEvidence.getByText("7.5 元", { exact: true })).toBeVisible();
  await expect(recentEvidence.getByText("未答对", { exact: true })).toBeVisible();
  await expect(recentEvidence.getByText("已答对", { exact: true }).first()).toBeVisible();

  const hasNoHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(hasNoHorizontalOverflow).toBe(true);
});
