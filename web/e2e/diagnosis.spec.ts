import { DatabaseSync } from "node:sqlite";
import { expect, test, type Page } from "@playwright/test";

test.setTimeout(180_000);

function currentCorrectAnswer(): string {
  const sqlite = new DatabaseSync(".tmp/e2e.sqlite", { readOnly: true });
  try {
    const row = sqlite.prepare(`
      select si.answer_spec_snapshot as answer_spec
      from session_items si
      join training_sessions ts on ts.id = si.session_id
      join diagnostic_runs dr on dr.id = ts.diagnostic_run_id
      where dr.status = 'in_progress'
        and not exists (select 1 from attempts a where a.session_item_id = si.id)
      order by ts.diagnostic_part_number desc, si.position desc
      limit 1
    `).get() as { answer_spec: string } | undefined;
    if (!row) throw new Error("No current diagnostic item was persisted");
    const spec = JSON.parse(row.answer_spec) as
      | { kind: "choice"; value: string }
      | { kind: "number"; value: number; unit: string | null };
    return spec.kind === "choice" ? spec.value : `${spec.value}${spec.unit ?? ""}`;
  } finally {
    sqlite.close();
  }
}

const RETEST_RUN_ID = "22222222-2222-4222-8222-222222222222";
const RETEST_SESSION_ID = "33333333-3333-4333-8333-333333333333";

function seedActiveRetest() {
  const sqlite = new DatabaseSync(".tmp/e2e.sqlite");
  try {
    const template = sqlite.prepare(`
      select qt.id, qt.stem, qt.answer_spec, qt.explanation, qt.skill_id, s.name as skill_name,
        qt.content_tier, qt.structure_tag, qt.answer_mode, qt.domain
      from question_templates qt join skills s on s.id = qt.skill_id
      where qt.active = 1 order by qt.id limit 1
    `).get() as Record<string, string>;
    sqlite.prepare("insert into diagnostic_runs (id, child_id, version, status, current_part, seed, started_at) values (?, 'child', 2, 'in_progress', 1, 'e2e-retest', 2)")
      .run(RETEST_RUN_ID);
    sqlite.prepare("insert into diagnostic_parts (run_id, part_number, status, started_at) values (?, 1, 'in_progress', 2), (?, 2, 'locked', null), (?, 3, 'locked', null)")
      .run(RETEST_RUN_ID, RETEST_RUN_ID, RETEST_RUN_ID);
    sqlite.prepare("insert into training_sessions (id, child_id, session_date, kind, rule_version, composition_snapshot, diagnostic_run_id, diagnostic_part_number, status, started_at) values (?, 'child', '2026-08-20', 'diagnostic', 'phase2a-v1', '{}', ?, 1, 'in_progress', 2)")
      .run(RETEST_SESSION_ID, RETEST_RUN_ID);
    sqlite.prepare(`
      insert into session_items (
        id, session_id, question_template_id, position, stem_snapshot, answer_spec_snapshot,
        explanation_snapshot, skill_id_snapshot, skill_name_snapshot, difficulty_snapshot,
        content_tier_snapshot, structure_tag_snapshot, variant_seed, selection_reason_snapshot
      ) values (?, ?, ?, 1, ?, ?, ?, ?, ?, 2, ?, ?, 'e2e-retest', ?)
    `).run(
      "44444444-4444-4444-8444-444444444444", RETEST_SESSION_ID, template.id,
      template.stem, template.answer_spec, template.explanation, template.skill_id, template.skill_name,
      template.content_tier, template.structure_tag,
      JSON.stringify({ answerMode: template.answer_mode, domain: template.domain }),
    );
  } finally {
    sqlite.close();
  }
}

function removeActiveRetest() {
  const sqlite = new DatabaseSync(".tmp/e2e.sqlite");
  try {
    sqlite.prepare("delete from training_sessions where id = ?").run(RETEST_SESSION_ID);
    sqlite.prepare("delete from diagnostic_runs where id = ?").run(RETEST_RUN_ID);
  } finally {
    sqlite.close();
  }
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test("@tablet child resumes and completes all three diagnosis parts", async ({ page }) => {
  const tabletViewport = page.viewportSize();
  await page.goto("/login");
  await page.getByRole("button", { name: /我是孩子/ }).click();
  await page.getByLabel("PIN").fill("2468");
  await Promise.all([
    page.waitForURL("**/child"),
    page.getByRole("button", { name: "登录", exact: true }).click(),
  ]);
  await page.getByRole("link", { name: "继续初始诊断" }).click();
  await expect(page.getByText("第 1 部分，共 3 部分")).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: ".tmp/diagnosis-tablet.png", fullPage: true });

  let reloadedStem = "";
  for (let index = 0; index < 45; index += 1) {
    const answer = index === 2 ? "一定不是正确答案" : currentCorrectAnswer();
    const narrowActiveAnswer = index === 3;
    if (narrowActiveAnswer) {
      await page.setViewportSize({ width: 390, height: 844 });
      await expectNoHorizontalOverflow(page);
      const interactiveLocators = [page.getByLabel("你的答案"), page.getByRole("button", { name: "提交答案" })];
      for (const locator of [page.locator(".questionCard"), ...interactiveLocators]) {
        const box = await locator.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(390);
      }
      for (const locator of interactiveLocators) expect((await locator.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await page.screenshot({ path: ".tmp/diagnosis-390-active.png", fullPage: true });
    }
    await page.getByLabel("你的答案").fill(answer);
    await page.getByRole("button", { name: "提交答案" }).click();
    await expect(page.getByRole("heading", { name: "这题已记录" })).toBeVisible();
    if (index < 2) await expect(page.getByText("作答正确。")).toBeVisible();
    if (index === 2) await expect(page.getByText(/结束后一起看需要加强/)).toBeVisible();

    const buttonName = index === 44 ? "查看完成" : "下一题";
    await page.getByRole("button", { name: buttonName }).click();
    if (index === 44) break;
    await expect(page.getByLabel("你的答案")).toBeVisible();
    if (narrowActiveAnswer && tabletViewport) await page.setViewportSize(tabletViewport);

    if (index === 2) {
      reloadedStem = await page.getByRole("heading", { level: 1 }).innerText();
      await page.reload();
      await expect(page.getByRole("heading", { level: 1, name: reloadedStem })).toBeVisible();
    }
  }

  await expect(page.getByRole("heading", { name: "三部分都完成了" })).toBeVisible();
  await expect(page.getByText("你认真完成了 45 道题。家长端现在可以查看暂定报告。")).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page);
});

test("@tablet parent diagnosis report is available in the tablet browser", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /我是家长/ }).click();
  await page.getByLabel("家长密码").fill("parent-test-1234");
  await Promise.all([
    page.waitForURL("**/parent"),
    page.getByRole("button", { name: "登录", exact: true }).click(),
  ]);

  await expect(page.getByRole("heading", { name: "初始诊断报告 · 第 1 版 · 45/45" })).toBeVisible();
  await expect(page.getByTestId("diagnosis-domain-status")).toHaveCount(6);
  await expect(page.getByTestId("diagnosis-difficulty-part")).toHaveCount(3);
  await expectNoHorizontalOverflow(page);
});

test("@tablet active retest entry remains a secondary keyboard and touch target", async ({ page }) => {
  seedActiveRetest();
  try {
    await page.goto("/login");
    await page.getByRole("button", { name: /我是孩子/ }).click();
    await page.getByLabel("PIN").fill("2468");
    await Promise.all([
      page.waitForURL("**/child"),
      page.getByRole("button", { name: "登录", exact: true }).click(),
    ]);

    const retestLink = page.getByRole("link", { name: "继续第 2 版诊断" });
    await expect(retestLink).toBeVisible();
    expect((await retestLink.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(retestLink).toBeFocused();
    expect(await retestLink.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
  } finally {
    removeActiveRetest();
  }
});

test("@parent parent sees the versioned provisional diagnosis report", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /我是家长/ }).click();
  await page.getByLabel("家长密码").fill("parent-test-1234");
  await Promise.all([
    page.waitForURL("**/parent"),
    page.getByRole("button", { name: "登录", exact: true }).click(),
  ]);

  await expect(page.getByRole("heading", { name: "初始诊断报告 · 第 1 版 · 45/45" })).toBeVisible();
  await expect(page.getByText("这些是暂定状态，会随之后的跨日练习更新。")).toBeVisible();
  await expect(page.getByTestId("diagnosis-domain-status")).toHaveCount(6);
  await expect(page.getByText(/难度路径/)).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: ".tmp/diagnosis-parent.png", fullPage: true });
});
