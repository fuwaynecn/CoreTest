import { expect, test } from "@playwright/test";

test.setTimeout(60_000);

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
