import { render, screen } from "@testing-library/react";
import ChildHomePage from "./page";

const getOrCreateDailySession = vi.hoisted(() => vi.fn());
const getOrCreateDiagnosis = vi.hoisted(() => vi.fn());

vi.mock("@/db/client", () => ({ getDatabase: () => ({}) }));
vi.mock("@/lib/auth/current-user", () => ({
  requireRole: vi.fn().mockResolvedValue({ id: "child-1", role: "child", displayName: "小雨" }),
}));
vi.mock("@/services/training/create-daily-session", () => ({
  DailyTrainingLockedError: class DailyTrainingLockedError extends Error {},
  getOrCreateDailySession,
}));
vi.mock("@/services/diagnosis/diagnosis-service", () => ({ getOrCreateDiagnosis }));

beforeEach(() => {
  getOrCreateDailySession.mockReset();
  getOrCreateDiagnosis.mockReset();
});

test("routes an undiagnosed child to the persisted diagnosis without creating daily work", async () => {
  const { DailyTrainingLockedError } = await import("@/services/training/create-daily-session");
  getOrCreateDailySession.mockImplementation(() => { throw new DailyTrainingLockedError(); });
  getOrCreateDiagnosis.mockReturnValue({ runId: "run-1", completedSlots: 22, totalSlots: 45 });

  render(await ChildHomePage());

  expect(screen.getByRole("link", { name: "继续初始诊断" })).toHaveAttribute("href", "/child/diagnosis/run-1");
  expect(screen.getByText("已完成 22 / 45 题")).toBeVisible();
  expect(getOrCreateDailySession).toHaveBeenCalledTimes(1);
  expect(getOrCreateDiagnosis).toHaveBeenCalledTimes(1);
});
