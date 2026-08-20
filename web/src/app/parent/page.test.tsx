import { render, screen, within } from "@testing-library/react";
import { diagnosticRuns, questionTemplates, skills, users } from "@/db/schema";
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
    summary: {
      cumulative: { answered: 3, correct: 2, accuracy: 2 / 3 },
      today: { answered: 1, correct: 0, accuracy: 0 },
      week: { answered: 1, correct: 1, accuracy: 1 },
    },
    recent: [
      {
        stem: "每盒彩笔 7.5 元，买 1 盒需要付多少钱？请写单位。",
        answerText: "7.5",
        correct: false,
        submittedAt: Date.UTC(2026, 7, 19, 12),
        skillName: "读题与单位",
      },
      {
        stem: "每盒彩笔 7.5 元，买 1 盒需要付多少钱？请写单位。",
        answerText: "7.5 元",
        correct: true,
        submittedAt: Date.UTC(2026, 7, 19, 12, 1),
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

test("labels first-attempt periods and bases the recommendation on this week", async () => {
  render(await ParentPage());

  expect(requireRole).toHaveBeenCalledWith("parent");
  expect(getParentEvidence).toHaveBeenCalledWith(state.db, "child-1");
  expect(screen.getByRole("heading", { name: "小雨的学习证据" })).toBeInTheDocument();
  expect(screen.getByText("首次作答证据")).toBeInTheDocument();
  expect(screen.getByText("累计首次作答")).toBeInTheDocument();
  expect(screen.getByText("累计首次答对率 67%")).toBeInTheDocument();
  expect(screen.getByText("今日首次作答")).toBeInTheDocument();
  expect(screen.getByText("今日首次答对率 0%")).toBeInTheDocument();
  expect(screen.getByText("本周首次作答")).toBeInTheDocument();
  expect(screen.getByText("本周首次答对率 100%")).toBeInTheDocument();
  expect(screen.getByText("保持当前训练节奏")).toBeInTheDocument();

  const rows = screen.getAllByRole("row", { name: /每盒彩笔/ });
  expect(within(rows[0]).getByText("7.5")).toBeInTheDocument();
  expect(within(rows[0]).getByText("未答对")).toBeInTheDocument();
  expect(within(rows[1]).getByText("7.5 元")).toBeInTheDocument();
  expect(within(rows[1]).getByText("已答对")).toBeInTheDocument();
  expect(screen.queryByText(/能力诊断|最终诊断/)).not.toBeInTheDocument();
});

test("shows diagnosis progress before completion", async () => {
  const db = state.db as ReturnType<typeof createTestDatabase>;
  db.insert(diagnosticRuns).values({
    id: "run-progress",
    childId: "child-1",
    version: 1,
    status: "in_progress",
    currentPart: 2,
    seed: "seed",
    startedAt: 1,
  }).run();
  db.run("insert into diagnostic_parts (run_id, part_number, status) values ('run-progress', 1, 'completed'), ('run-progress', 2, 'in_progress'), ('run-progress', 3, 'locked')");
  db.run("insert into training_sessions (id, child_id, session_date, status, kind, diagnostic_run_id, diagnostic_part_number, started_at) values ('diagnostic-session', 'child-1', '2026-08-20', 'in_progress', 'diagnostic', 'run-progress', 2, 1)");
  db.insert(skills).values({ id: "skill", code: "skill", name: "技能", domain: "数与运算" }).run();
  db.insert(questionTemplates).values({
    id: "template",
    skillId: "skill",
    stem: "题目",
    answerSpec: "{}",
    explanation: "讲解",
    difficulty: 2,
  }).run();
  for (let index = 0; index < 22; index += 1) {
    db.run(`insert into session_items (id, session_id, question_template_id, position, stem_snapshot, answer_spec_snapshot, explanation_snapshot, skill_id_snapshot, skill_name_snapshot) values ('item-${index}', 'diagnostic-session', 'template', ${index}, '题目', '{}', '讲解', 'skill', '技能')`);
    db.run(`insert into attempts (id, session_item_id, client_submission_id, answer_text, is_correct, normalized_answer, explanation, session_completed, submitted_at) values ('attempt-${index}', 'item-${index}', 'submission-${index}', '1', 1, '1', '讲解', 0, ${index + 1})`);
  }

  render(await ParentPage());
  expect(screen.getByText("诊断进行中 · 22/45")).toBeVisible();
});

test("labels all six completed-domain results as provisional version one", async () => {
  const db = state.db as ReturnType<typeof createTestDatabase>;
  const domains = [
    "number_operations", "equation_algebra", "geometry_space", "data_statistics",
    "application_modeling", "thinking_habits",
  ];
  db.insert(diagnosticRuns).values({
    id: "run-complete",
    childId: "child-1",
    version: 1,
    status: "completed",
    currentPart: 3,
    seed: "seed",
    reportSnapshot: JSON.stringify({
      skills: [],
      domains: domains.map((domain, index) => ({
        domain,
        status: index % 3 === 0 ? "needs_support" : index % 3 === 1 ? "learning" : "basic",
        weightedRate: 60,
        evidenceCount: 7,
        distinctIndependentCorrectTemplates: 3,
      })),
    }),
    startedAt: 1,
    completedAt: 2,
  }).run();

  render(await ParentPage());
  expect(screen.getByText("初始诊断报告 · 第 1 版 · 45/45")).toBeVisible();
  expect(screen.getByText("这些是暂定状态，会随之后的跨日练习更新。")).toBeVisible();
  expect(screen.getAllByTestId("diagnosis-domain-status")).toHaveLength(6);
});
