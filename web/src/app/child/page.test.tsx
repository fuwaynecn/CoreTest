import { render, screen } from "@testing-library/react";
import ChildHomePage from "./page";

const getOrCreateDailySession = vi.hoisted(() => vi.fn());
const getOrCreateDiagnosis = vi.hoisted(() => vi.fn());
const getDiagnosisLearningGate = vi.hoisted(() => vi.fn());

vi.mock("@/db/client", () => ({ getDatabase: () => ({}) }));
vi.mock("@/lib/auth/current-user", () => ({
  requireRole: vi.fn().mockResolvedValue({ id: "child-1", role: "child", displayName: "小雨" }),
}));
vi.mock("@/services/training/create-daily-session", () => ({
  DailyTrainingLockedError: class DailyTrainingLockedError extends Error {},
  getOrCreateDailySession,
}));
vi.mock("@/services/diagnosis/diagnosis-service", () => ({ getDiagnosisLearningGate, getOrCreateDiagnosis }));

beforeEach(() => {
  getOrCreateDailySession.mockReset();
  getOrCreateDiagnosis.mockReset();
  getDiagnosisLearningGate.mockReset();
});

test("routes an undiagnosed child to the persisted diagnosis without creating daily work", async () => {
  getDiagnosisLearningGate.mockReturnValue({ formalDailyUnlocked: false, activeDiagnosis: null });
  getOrCreateDiagnosis.mockReturnValue({ runId: "run-1", completedSlots: 22, totalSlots: 45 });

  render(await ChildHomePage());

  expect(screen.getByRole("link", { name: "继续初始诊断" })).toHaveAttribute("href", "/child/diagnosis/run-1");
  expect(screen.getByText("已完成 22 / 45 题")).toBeVisible();
  expect(getOrCreateDailySession).not.toHaveBeenCalled();
  expect(getOrCreateDiagnosis).toHaveBeenCalledTimes(1);
});

test("keeps daily training available while a version two retest is active", async () => {
  getDiagnosisLearningGate.mockReturnValue({
    formalDailyUnlocked: true,
    activeDiagnosis: { runId: "run-v2", version: 2, completedSlots: 4, totalSlots: 45 },
  });
  getOrCreateDailySession.mockReturnValue({
    id: "daily-1",
    questions: [{ answered: false }],
  });

  render(await ChildHomePage());

  expect(screen.getByRole("link", { name: "开始今天的训练" })).toHaveAttribute("href", "/child/session/daily-1");
  expect(screen.getByRole("link", { name: "继续第 2 版诊断" })).toHaveAttribute("href", "/child/diagnosis/run-v2");
  expect(getOrCreateDailySession).toHaveBeenCalledTimes(1);
  expect(getOrCreateDiagnosis).not.toHaveBeenCalled();
});
