import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DosageView, DueReviewView } from "@/services/parent/get-learning-state";
import { DosageSummary } from "./dosage-summary";

const trigger = {
  evidenceId: "evidence-review",
  attemptId: "attempt-review-correction",
  sessionItemId: "item-review",
  sessionId: "session-review",
  occurredOn: "2026-08-22",
  stem: "3x+5=26，x 是多少？",
  result: "corrected" as const,
  firstAttemptCorrect: false,
  independent: false,
  hintLevel: 1,
};

const dueReviews: DueReviewView[] = [{
  skillId: "skill-equation",
  skillCode: "equation-two-step",
  skillName: "两步方程",
  level: 0,
  dueOn: "2026-08-23",
  overdueDays: 0,
  lastResult: "corrected",
  supportingEvidenceIds: ["evidence-review"],
  trigger,
}];

const equation: DosageView = {
  track: "equation",
  level: 3,
  weeklyTarget: 18,
  sessionMin: 4,
  sessionTarget: 5,
  sessionMax: 6,
  reasonCode: "support",
  parentInterventionSuggested: false,
  supportingEvidenceIds: ["evidence-day-1", "evidence-review"],
  recentWindow: [{
    sessionId: "session-review",
    on: "2026-08-22",
    independentCorrectCount: 0,
    totalCount: 2,
    accuracy: 0,
    highestHintLevel: 1,
    dueReviewOutcome: "failed",
    cappedStructureNeedsSupport: false,
    supportingEvidenceIds: ["evidence-day-1", "evidence-review"],
    attemptIds: ["attempt-day-1", "attempt-review"],
    evidence: [
      { ...trigger, evidenceId: "evidence-day-1", attemptId: "attempt-day-1", result: "incorrect" as const },
      trigger,
    ],
  }],
};

test("drills due reviews and dosage reasons into exact immutable evidence", async () => {
  render(<DosageSummary dosage={{ computation: null, equation }} dueReviews={dueReviews} />);

  await userEvent.click(screen.getByText("查看本次到期依据"));
  expect(screen.getByText("上次结果：订正后正确")).toBeVisible();
  expect(screen.getAllByText(/会话 session-review/)[0]).toBeVisible();
  expect(screen.getByRole("link", { name: "打开这条复习证据" }))
    .toHaveAttribute("href", "#mastery-evidence-evidence-review");

  await userEvent.click(screen.getByText("查看最近剂量证据"));
  expect(screen.getByText("独立首答准确率 0%（0/2）")).toBeVisible();
  expect(screen.getByText("到期复习：未通过")).toBeVisible();
  expect(screen.getAllByText("最高提示级别 1").at(-1)).toBeVisible();
  expect(screen.getByRole("link", { name: /打开 2026-08-22 的第 1 条证据/ }))
    .toHaveAttribute("href", "#mastery-evidence-evidence-day-1");
});
