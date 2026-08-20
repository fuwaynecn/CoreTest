import { DatabaseSync } from "node:sqlite";
import { expect, test, type Page } from "@playwright/test";

test.setTimeout(180_000);

function currentCorrectAnswer(): { kind: "choice" | "number"; value: string } {
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
    return {
      kind: spec.kind,
      value: spec.kind === "choice" ? spec.value : `${spec.value}${spec.unit ?? ""}`,
    };
  } finally {
    sqlite.close();
  }
}

async function answerCurrentQuestion(page: Page, answer: { kind: "choice" | "number"; value: string }) {
  if (answer.kind === "choice") {
    await page.getByRole("button", { name: new RegExp(`^${answer.value}\\.`) }).click();
  } else {
    await page.getByLabel("你的答案").fill(answer.value);
  }
  await page.getByRole("button", { name: "提交答案" }).click();
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
  let checkedChoiceTouchTarget = false;
  for (let index = 0; index < 45; index += 1) {
    const persistedAnswer = currentCorrectAnswer();
    const answer = index === 2
      ? persistedAnswer.kind === "choice"
        ? {
            kind: "choice" as const,
            value: (["A", "B", "C", "D"] as const).find((label) => label !== persistedAnswer.value)!,
          }
        : { kind: "number" as const, value: "一定不是正确答案" }
      : persistedAnswer;
    if (persistedAnswer.kind === "choice" && !checkedChoiceTouchTarget) {
      const choiceButtons = page.locator(".diagnosisChoices button");
      await expect(choiceButtons).toHaveCount(4);
      for (const button of await choiceButtons.all()) {
        expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      checkedChoiceTouchTarget = true;
    }
    const narrowActiveAnswer = index === 3;
    if (narrowActiveAnswer) {
      await page.setViewportSize({ width: 390, height: 844 });
      await expectNoHorizontalOverflow(page);
      const answerControl = persistedAnswer.kind === "choice"
        ? page.getByRole("button", { name: new RegExp(`^${persistedAnswer.value}\\.`) })
        : page.getByLabel("你的答案");
      const interactiveLocators = [answerControl, page.getByRole("button", { name: "提交答案" })];
      for (const locator of [page.locator(".questionCard"), ...interactiveLocators]) {
        const box = await locator.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(390);
      }
      for (const locator of interactiveLocators) expect((await locator.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await page.screenshot({ path: ".tmp/diagnosis-390-active.png", fullPage: true });
    }
    await answerCurrentQuestion(page, answer);
    await expect(page.getByRole("heading", { name: "这题已记录" })).toBeVisible();
    if (index < 2) await expect(page.getByText("作答正确。")).toBeVisible();
    if (index === 2) await expect(page.getByText(/结束后一起看需要加强/)).toBeVisible();

    const buttonName = index === 44 ? "查看完成" : "下一题";
    await page.getByRole("button", { name: buttonName }).click();
    if (index === 44) break;
    await expect(page.locator(".diagnosisAnswerForm")).toBeVisible();
    if (narrowActiveAnswer && tabletViewport) await page.setViewportSize(tabletViewport);

    if (index === 2) {
      reloadedStem = await page.getByRole("heading", { level: 1 }).innerText();
      await page.reload();
      await expect(page.getByRole("heading", { level: 1, name: reloadedStem })).toBeVisible();
    }
  }

  await expect(page.getByRole("heading", { name: "三部分都完成了" })).toBeVisible();
  expect(checkedChoiceTouchTarget).toBe(true);
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

test("@tablet parent starts version two and the child continues while version one remains visible", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /我是家长/ }).click();
  await page.getByLabel("家长密码").fill("parent-test-1234");
  await Promise.all([
    page.waitForURL("**/parent"),
    page.getByRole("button", { name: "登录", exact: true }).click(),
  ]);
  await page.getByRole("button", { name: "发起第 2 版诊断" }).click();
  await expect(page.getByRole("heading", { name: "诊断进行中 · 第 2 版 · 0/45" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "最近完成报告 · 第 1 版 · 45/45" })).toBeVisible();
  await expect(page.getByText("第 2 版 · 进行中")).toBeVisible();
  await expect(page.getByText("第 1 版 · 已完成")).toBeVisible();

  await page.context().clearCookies();
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
  await retestLink.click();
  const answer = currentCorrectAnswer();
  await answerCurrentQuestion(page, answer);
  await expect(page.getByRole("heading", { name: "这题已记录" })).toBeVisible();

  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByRole("button", { name: /我是家长/ }).click();
  await page.getByLabel("家长密码").fill("parent-test-1234");
  await Promise.all([
    page.waitForURL("**/parent"),
    page.getByRole("button", { name: "登录", exact: true }).click(),
  ]);
  await expect(page.getByRole("heading", { name: "诊断进行中 · 第 2 版 · 1/45" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "最近完成报告 · 第 1 版 · 45/45" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("@parent parent sees the versioned provisional diagnosis report", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /我是家长/ }).click();
  await page.getByLabel("家长密码").fill("parent-test-1234");
  await Promise.all([
    page.waitForURL("**/parent"),
    page.getByRole("button", { name: "登录", exact: true }).click(),
  ]);

  await expect(page.getByRole("heading", { name: "最近完成报告 · 第 1 版 · 45/45" })).toBeVisible();
  await expect(page.getByText("这些是暂定状态，会随之后的跨日练习更新。")).toBeVisible();
  await expect(page.getByTestId("diagnosis-domain-status")).toHaveCount(6);
  await expect(page.getByText(/难度路径/)).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: ".tmp/diagnosis-parent.png", fullPage: true });
});
