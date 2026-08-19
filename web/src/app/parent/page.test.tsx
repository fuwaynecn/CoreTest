import { render, screen, within } from "@testing-library/react";
import { users } from "@/db/schema";
import { createTestDatabase } from "@/test/test-db";
import ParentPage from "./page";

const state = vi.hoisted(() => ({ db: undefined as unknown }));
const getParentEvidence = vi.hoisted(() => vi.fn());
const requireRole = vi.hoisted(() => vi.fn().mockResolvedValue({
  id: "parent",
  role: "parent",
  displayName: "家长",
}));

vi.mock("@/db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/client")>();
  return { ...actual, getDatabase: () => state.db };
});
vi.mock("@/lib/auth/current-user", () => ({ requireRole }));
vi.mock("@/services/training/get-parent-evidence", () => ({ getParentEvidence }));

beforeEach(() => {
  const db = createTestDatabase();
  db.insert(users).values({
    id: "child-1",
    role: "child",
    displayName: "小雨",
    credentialHash: "hash",
    createdAt: 1,
  }).run();
  state.db = db;
  getParentEvidence.mockReturnValue({
    summary: { answered: 2, correct: 1, accuracy: 0.5 },
    recent: [
      {
        stem: "每盒彩笔 7.5 元，买 1 盒需要付多少钱？请写单位。",
        answerText: "7.5",
        correct: false,
        submittedAt: Date.UTC(2026, 7, 19, 12),
        skillName: "读题与单位",
      },
    ],
    skills: [
      { skillName: "读题与单位", status: "needs_support", evidenceCount: 2 },
      { skillName: "小数计算", status: "learning", evidenceCount: 1 },
      { skillName: "一步方程", status: "basic", evidenceCount: 3 },
    ],
  });
});

test("shows supporting evidence and a measured recommendation without a final diagnosis", async () => {
  render(await ParentPage());

  expect(requireRole).toHaveBeenCalledWith("parent");
  expect(getParentEvidence).toHaveBeenCalledWith(state.db, "child-1");
  expect(screen.getByRole("heading", { name: "小雨的学习证据" })).toBeInTheDocument();
  expect(screen.getByText("首次作答证据")).toBeInTheDocument();
  expect(screen.getByText("50%", { exact: false })).toBeInTheDocument();
  expect(screen.getByText("本周先看错题原因，不额外加量")).toBeInTheDocument();

  const row = screen.getByRole("row", { name: /每盒彩笔/ });
  expect(within(row).getByText("7.5")).toBeInTheDocument();
  expect(within(row).getByText("未答对")).toBeInTheDocument();
  expect(screen.queryByText(/能力诊断|最终诊断/)).not.toBeInTheDocument();
});
