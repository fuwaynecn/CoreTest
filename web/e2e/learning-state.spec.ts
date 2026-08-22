import path from "node:path";
import { expect, test } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { createDatabase } from "../src/db/client";
import { diagnosticRuns, reviewSchedules, users } from "../src/db/schema";

test.setTimeout(90_000);

function todayInShanghai() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function prepareIndependentScenario() {
  const expectedPath = path.resolve(process.cwd(), ".tmp", "e2e.sqlite");
  const databasePath = path.resolve(process.cwd(), ".tmp/e2e.sqlite");
  if (databasePath !== expectedPath || !databasePath.endsWith(`${path.sep}.tmp${path.sep}e2e.sqlite`)) {
    throw new Error("Learning-state fixture may only use .tmp/e2e.sqlite");
  }

  const db = createDatabase(databasePath);
  try {
    if (!db.select({ id: users.id }).from(users).where(eq(users.id, "child")).get()?.id) {
      throw new Error("Learning-state fixture requires the seeded E2E child");
    }
    const completedDiagnosis = db.select({ id: diagnosticRuns.id }).from(diagnosticRuns)
      .where(and(eq(diagnosticRuns.childId, "child"), eq(diagnosticRuns.status, "completed"))).get();
    if (!completedDiagnosis) {
      db.insert(diagnosticRuns).values({
        id: "e2e-learning-state-prerequisite", childId: "child", version: 9_001,
        status: "completed", currentPart: 3, seed: "e2e-learning-state-prerequisite",
        reportSnapshot: JSON.stringify({ skills: [], domains: [] }), startedAt: 1, completedAt: 2,
      }).onConflictDoNothing().run();
    }

    // Reset only this acceptance scenario in the checked temporary database.
    const today = todayInShanghai();
    for (const source of ["parent", "child", "system"]) {
      db.run(`delete from error_observations where source = '${source}' and session_item_id in (
        select si.id from session_items si join training_sessions ts on ts.id = si.session_id
        where ts.child_id = 'child' and ts.kind = 'daily' and ts.session_date = '${today}')`);
    }
    db.run(`delete from mastery_evidence where session_item_id in (
      select si.id from session_items si join training_sessions ts on ts.id = si.session_id
      where ts.child_id = 'child' and ts.kind = 'daily' and ts.session_date = '${today}')`);
    db.run(`delete from attempts where session_item_id in (
      select si.id from session_items si join training_sessions ts on ts.id = si.session_id
      where ts.child_id = 'child' and ts.kind = 'daily' and ts.session_date = '${today}')`);
    db.run(`delete from training_sessions where child_id = 'child' and kind = 'daily' and session_date = '${today}'`);
    db.run("delete from mastery_states where child_id = 'child'");
    db.run("delete from review_schedules where child_id = 'child'");
    db.run("delete from dosage_states where child_id = 'child'");
  } finally {
    db.$client.close();
  }
}

test("@tablet @parent missing unit becomes traceable evidence and a parent correction", async ({ page, context }, testInfo) => {
  prepareIndependentScenario();

  await page.goto("/");
  await page.getByRole("link", { name: "进入系统" }).click();
  await page.getByRole("button", { name: /我是孩子/ }).click();
  await page.getByLabel("PIN").fill("2468");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.getByRole("link", { name: "开始今天的训练" }).click();

  await page.getByLabel("你的答案").fill("6");
  await page.getByRole("button", { name: "提交答案" }).click();
  await page.getByRole("button", { name: "下一题" }).click();

  const readingQuestion = "每盒彩笔 7.5 元，买 1 盒需要付多少钱？请写单位。";
  await expect(page.getByRole("heading", { name: readingQuestion })).toBeVisible();
  await page.getByLabel("你的答案").fill("7.5");
  await page.getByRole("button", { name: "提交答案" }).click();
  await expect(page.getByText(/必须带单位/)).toBeVisible();
  await page.getByRole("button", { name: "修改答案" }).click();
  await page.getByLabel("你的答案").fill("7.5 元");
  await page.getByRole("button", { name: "提交答案" }).click();
  await page.getByRole("button", { name: "漏了条件或单位" }).click();
  await page.getByRole("button", { name: "下一题" }).click();

  await page.getByLabel("你的答案").fill("7");
  await page.getByRole("button", { name: "提交答案" }).click();
  await page.getByRole("button", { name: "下一题" }).click();
  await expect(page.getByRole("heading", { name: "你认真完成了今天的题目" })).toBeVisible();

  const fixtureDb = createDatabase(".tmp/e2e.sqlite");
  fixtureDb.insert(reviewSchedules).values({
    childId: "child", skillId: "skill-reading", level: 0,
    dueOn: todayInShanghai(), lastResult: "corrected", updatedAt: Date.now(),
  }).onConflictDoUpdate({
    target: [reviewSchedules.childId, reviewSchedules.skillId],
    set: { dueOn: todayInShanghai(), lastResult: "corrected", updatedAt: Date.now() },
  }).run();
  fixtureDb.$client.close();

  await context.clearCookies();
  await page.goto("/login");
  await page.getByRole("button", { name: /我是家长/ }).click();
  await page.getByLabel("家长密码").fill("parent-test-1234");
  await Promise.all([
    page.waitForURL("**/parent"),
    page.getByRole("button", { name: "登录", exact: true }).click(),
  ]);

  await expect(page.getByRole("heading", { name: "六领域能力地图" })).toBeVisible();
  const computationState = page.locator(".masteryStateGroup")
    .filter({ has: page.getByText("小数计算", { exact: true }) });
  await computationState.locator("summary").first().click();
  await expect(computationState.getByText("为什么是这个状态", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "算力 1 级" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "方程 1 级" })).toBeVisible();
  await expect(page.getByText("4–6 题")).toBeVisible();

  const habitTotal = page.locator('.errorTotals [data-category="habit"]');
  await expect(habitTotal).toContainText("1");
  await habitTotal.getByRole("link", { name: "查看习惯性失误证据" }).click();
  const evidence = page.getByRole("article", { name: /读题与单位题的错因证据/ });
  await expect(evidence).toContainText("7.5 元");
  await expect(evidence).toContainText("孩子自评");
  await expect(page.getByText(`${todayInShanghai()} · 今天到期`)).toBeVisible();
  await page.getByText("查看本次到期依据").click();
  await expect(page.getByText("上次结果：订正后正确")).toBeVisible();
  await expect(page.getByRole("link", { name: "打开这条复习证据" }))
    .toHaveAttribute("href", /#mastery-evidence-/);
  const computationDose = page.locator('.doseCard[data-track="computation"]');
  await computationDose.getByText("查看最近剂量证据").click();
  await expect(computationDose.getByText(/独立首答准确率 100%（1\/1）/)).toBeVisible();
  await expect(computationDose.getByRole("link", { name: /打开 .* 的第 1 条证据/ }))
    .toHaveAttribute("href", /#mastery-evidence-/);
  await page.locator(".dosageSection").screenshot({
    path: `.tmp/learning-state-dosage-${testInfo.project.name}.png`,
  });
  if (testInfo.project.name !== "parent-mobile") {
    await page.locator(".abilityMap").screenshot({ path: `.tmp/learning-state-${testInfo.project.name}.png` });
  }

  await evidence.getByLabel("修正当前错因").selectOption("relationship");
  await evidence.getByRole("button", { name: "保存家长修正" }).click();
  await expect(page.getByRole("heading", { name: "数量关系或方法不清楚" })).toBeVisible();
  await expect(page.locator('.errorTotals [data-category="knowledge"]')).toContainText("1");
  await expect(page.locator('.errorTotals [data-category="habit"]')).toContainText("0");
  await evidence.getByText("查看完整错因审计").click();
  await expect(evidence.getByText("家长修正：数量关系或方法不清楚")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
