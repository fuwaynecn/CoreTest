import { render, screen } from "@testing-library/react";
import ChildSessionPage from "./page";

const getOrCreateDailySession = vi.hoisted(() => vi.fn());

vi.mock("@/db/client", () => ({
  getDatabase: () => ({
    select: () => ({ from: () => ({ where: () => ({ all: () => [], get: () => undefined }) }) }),
  }),
}));
vi.mock("@/lib/auth/current-user", () => ({
  requireRole: vi.fn().mockResolvedValue({ id: "child-1", role: "child", displayName: "小雨" }),
}));
vi.mock("@/services/training/create-daily-session", () => ({
  DailyTrainingLockedError: class DailyTrainingLockedError extends Error {},
  getOrCreateDailySession,
}));

beforeEach(() => {
  getOrCreateDailySession.mockReset();
});

test("does not report a session with no questions as completed", async () => {
  getOrCreateDailySession.mockReturnValue({ id: "session-1", status: "in_progress", currentPosition: 0, questions: [] });

  render(await ChildSessionPage({ params: Promise.resolve({ id: "session-1" }) }));

  expect(screen.queryByRole("heading", { name: "你认真完成了今天的题目" })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "今天的题目正在准备中" })).toBeVisible();
});

test("still reports completion when every scheduled question is answered", async () => {
  getOrCreateDailySession.mockReturnValue({
    id: "session-1",
    status: "completed",
    currentPosition: 1,
    questions: [{ id: "item-1", position: 0, stem: "计算 1 + 1。", answered: true }],
  });

  render(await ChildSessionPage({ params: Promise.resolve({ id: "session-1" }) }));

  expect(screen.getByRole("heading", { name: "你认真完成了今天的题目" })).toBeVisible();
});
