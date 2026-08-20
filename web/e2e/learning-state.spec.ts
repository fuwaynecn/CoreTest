import { expect, test } from "@playwright/test";
import { createDatabase } from "../src/db/client";
import { reviewSchedules } from "../src/db/schema";

test.setTimeout(60_000);

function todayInShanghai() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

test("@tablet child creates a missing-unit evidence chain", async ({ page }) => {
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

  // Explicit acceptance fixture: make the production-created reading review due today
  // so the parent browser can verify Shanghai due-date rendering without changing app time.
  const fixtureDb = createDatabase(".tmp/e2e.sqlite");
  fixtureDb.insert(reviewSchedules).values({
    childId: "child",
    skillId: "skill-reading",
    level: 0,
    dueOn: todayInShanghai(),
    lastResult: "corrected",
    updatedAt: Date.now(),
  }).onConflictDoUpdate({
    target: [reviewSchedules.childId, reviewSchedules.skillId],
    set: { dueOn: todayInShanghai(), lastResult: "corrected", updatedAt: Date.now() },
  }).run();
  fixtureDb.$client.close();

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("@tablet parent learning state stays usable on a tablet", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /我是家长/ }).click();
  await page.getByLabel("家长密码").fill("parent-test-1234");
  await page.getByRole("button", { name: "登录", exact: true }).click();

  await expect(page.getByRole("heading", { name: "六领域能力地图" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "算力 1 级" })).toBeVisible();
  await expect(page.getByRole("article", { name: /读题与单位题的错因证据/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("@parent parent traces and corrects the effective cause", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /我是家长/ }).click();
  await page.getByLabel("家长密码").fill("parent-test-1234");
  await Promise.all([
    page.waitForURL("**/parent"),
    page.getByRole("button", { name: "登录", exact: true }).click(),
  ]);

  const habitTotal = page.locator('.errorTotals [data-category="habit"]');
  await expect(habitTotal).toContainText("习惯性失误");
  await expect(habitTotal).toContainText("1");
  await habitTotal.getByRole("link", { name: "查看习惯性失误证据" }).click();
  const evidence = page.getByRole("article", { name: /读题与单位题的错因证据/ });
  await expect(evidence).toBeVisible();
  await expect(evidence).toContainText("7.5 元");
  await expect(evidence).toContainText("孩子自评");

  await expect(page.getByText(`${todayInShanghai()} · 今天到期`)).toBeVisible();
  await expect(page.getByRole("heading", { name: "算力 1 级" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "方程 1 级" })).toBeVisible();
  await expect(page.getByText("4–6 题")).toBeVisible();

  await evidence.getByLabel("修正当前错因").selectOption("relationship");
  await evidence.getByRole("button", { name: "保存家长修正" }).click();
  await expect(page.getByRole("heading", { name: "数量关系或方法不清楚" })).toBeVisible();
  const knowledgeTotal = page.locator('.errorTotals [data-category="knowledge"]');
  await expect(knowledgeTotal).toContainText("1");
  await evidence.getByText("查看完整错因审计").click();
  await expect(evidence.getByText("家长修正：数量关系或方法不清楚")).toBeVisible();

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
