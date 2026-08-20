import { expect, test } from "@playwright/test";

test.setTimeout(60_000);

test("@tablet child completes a corrected learning session", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "进入系统" }).click();
  await page.getByRole("button", { name: /我是孩子/ }).click();
  await page.getByLabel("PIN").fill("2468");
  await page.getByRole("button", { name: "登录", exact: true }).click();

  await page.getByRole("link", { name: "开始今天的训练" }).click();
  await expect(page.getByRole("heading", { name: "3.6 + 2.4 = ?", exact: true })).toBeVisible();
  await page.getByLabel("你的答案").fill("6");
  await page.getByRole("button", { name: "提交答案" }).click();
  await expect(page.getByText(/做对了/)).toBeVisible();
  await page.getByRole("button", { name: "下一题" }).click();

  const readingQuestion = "每盒彩笔 7.5 元，买 1 盒需要付多少钱？请写单位。";
  await expect(page.getByRole("heading", { name: readingQuestion })).toBeVisible();
  await page.getByLabel("你的答案").fill("7.5");
  await page.getByRole("button", { name: "提交答案" }).click();
  await expect(page.getByRole("heading", { name: /再看一步/ })).toBeVisible();
  await expect(page.getByText(/必须带单位/)).toBeVisible();
  await page.getByRole("button", { name: "修改答案" }).click();
  await page.getByLabel("你的答案").fill("7.5 元");
  await page.getByRole("button", { name: "提交答案" }).click();
  await expect(page.getByText(/做对了/)).toBeVisible();
  await page.getByRole("button", { name: "下一题" }).click();

  await expect(page.getByRole("heading", { name: "3x + 5 = 26，x 等于多少？" })).toBeVisible();
  await page.getByLabel("你的答案").fill("7");
  await page.getByRole("button", { name: "提交答案" }).click();
  await expect(page.getByText(/做对了/)).toBeVisible();
  await page.getByRole("button", { name: "下一题" }).click();

  await expect(page.getByRole("heading", { name: "你认真完成了今天的题目" })).toBeVisible();
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
  await expect(page.getByText("每盒彩笔 7.5 元，买 1 盒需要付多少钱？请写单位。").first()).toBeVisible();
  await expect(page.getByText("7.5", { exact: true })).toBeVisible();
  await expect(page.getByText("7.5 元", { exact: true })).toBeVisible();
  await expect(page.getByText("未答对", { exact: true })).toBeVisible();
  await expect(page.getByText("已答对", { exact: true }).first()).toBeVisible();

  const hasNoHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(hasNoHorizontalOverflow).toBe(true);
});
