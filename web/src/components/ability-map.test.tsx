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
  evidenceCursor: "evidence-2",
  supportingEvidenceIds: ["evidence-2"],
  evidence: [
    { id: "evidence-1", sessionItemId: "item-1", occurredOn: "2026-08-22", stem: "较早单位题", firstAnswer: "5", firstAttemptCorrect: true, independent: true, hintLevel: 0, activeDurationMs: 42_000 },
    { id: "evidence-2", sessionItemId: "item-2", occurredOn: "2026-08-23", stem: "状态依据单位题", firstAnswer: "7.5", firstAttemptCorrect: false, independent: false, hintLevel: null, activeDurationMs: 42_000 },
  ],
};

test("shows the exact state basis directly after opening a state and prefers the reducer evidence cursor", async () => {
  render(<AbilityMap abilities={[ability]} />);

  const link = screen.getByRole("link", { name: "查看 2026-08-23 的状态依据", hidden: true });
  expect(link).not.toBeVisible();
  await userEvent.click(screen.getByText("正在学习", { exact: true }));
  expect(link).toBeVisible();
  await userEvent.click(link);
  expect(document.querySelector("#mastery-evidence-evidence-2")).toBeVisible();
  expect(screen.getByText(/提示情况未知/)).toBeVisible();
  expect(screen.queryByText(/使用提示（级别 未知）/)).not.toBeInTheDocument();
});

test("summarizes zero-evidence undiagnosed skills instead of expanding every card", async () => {
  render(<AbilityMap abilities={[{
    ...ability,
    skillId: "waiting",
    skillName: "等待证据技能",
    status: "undiagnosed",
    reasonCode: "no_evidence",
    evidenceCount: 0,
    evidenceCursor: null,
    supportingEvidenceIds: [],
    evidence: [],
  }]} />);

  await userEvent.click(screen.getByText("尚未诊断", { exact: true }));
  expect(screen.getByText("1 项尚无题目证据")).toBeVisible();
  expect(screen.queryByText("为什么是这个状态")).not.toBeInTheDocument();
});
