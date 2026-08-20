import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AbilityView } from "@/services/parent/get-learning-state";
import { AbilityMap } from "./ability-map";

const ability: AbilityView = {
  skillId: "skill-reading",
  skillCode: "reading-unit",
  skillName: "读题与单位",
  domain: "thinking_habits",
  status: "learning",
  reasonCode: "recent_five_below_basic",
  reason: "最近 5 次首答尚未达到门槛。",
  evidenceCount: 5,
  updatedOn: "2026-08-23",
  evidence: [{ id: "evidence-1", sessionItemId: "item-1", occurredOn: "2026-08-23", stem: "单位题", firstAnswer: "7.5", firstAttemptCorrect: false, independent: true, hintLevel: 0, activeDurationMs: 42_000 }],
};

test("keeps state evidence compact until a parent opens that state", async () => {
  render(<AbilityMap abilities={[ability]} />);

  const link = screen.getByRole("link", { name: "查看 2026-08-23 的原始证据", hidden: true });
  expect(link).not.toBeVisible();
  await userEvent.click(screen.getByText("正在学习", { exact: true }));
  expect(link).toBeVisible();
  await userEvent.click(link);
  expect(document.querySelector("#mastery-evidence-evidence-1")).toBeVisible();
});
