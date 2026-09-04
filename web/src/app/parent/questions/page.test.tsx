import { render, screen } from "@testing-library/react";
import { createTestDatabase } from "@/test/test-db";
import { skills } from "@/db/schema";
import ParentQuestionsPage from "./page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const state = vi.hoisted(() => ({ db: undefined as unknown }));
const requireRole = vi.hoisted(() => vi.fn().mockResolvedValue({ id: "parent", role: "parent", displayName: "家长" }));
const listQuestionBank = vi.hoisted(() => vi.fn());
const ensureQuestionBankFresh = vi.hoisted(() => vi.fn());

vi.mock("@/db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/client")>();
  return { ...actual, getDatabase: () => state.db };
});
vi.mock("@/lib/auth/current-user", () => ({ requireRole }));
vi.mock("@/services/parent/question-bank", () => ({ listQuestionBank }));
vi.mock("@/services/questions/question-bank-refresh", () => ({ ensureQuestionBankFresh }));
vi.mock("@/components/question-bank-editor", () => ({ QuestionBankEditor: () => <div /> }));

function row(index: number) {
  return {
    id: `instance-${index}`, stem: `${index} + 1 = ?`, answerSpec: { kind: "number" as const, value: index + 1, tolerance: 0, unit: null },
    explanation: "计算即可", skillId: "skill-add", skillCode: "add", skillName: "整数加法", domain: "number_operations" as const,
    difficulty: 1 as const, active: true, status: "active" as const, templateId: "template-add", templateName: "加法", structureTag: "addition",
    answerMode: "written" as const, generatedAt: 1, updatedAt: 2, lastUsedAt: null,
  };
}

beforeEach(() => {
  state.db = createTestDatabase();
  (state.db as ReturnType<typeof createTestDatabase>).insert(skills).values({ id: "skill-add", code: "add", name: "整数加法", domain: "number_operations" }).run();
  listQuestionBank.mockReturnValue(Array.from({ length: 101 }, (_, index) => row(index)));
  ensureQuestionBankFresh.mockReset();
});

test("requires parent role, exposes native filters, and caps visible rows at 100", async () => {
  render(await ParentQuestionsPage({ searchParams: Promise.resolve({ skillId: "skill-add", domain: "number_operations", difficulty: "2", status: "inactive" }) }));

  expect(requireRole).toHaveBeenCalledWith("parent");
  expect(listQuestionBank).toHaveBeenCalledWith(state.db, { skillId: "skill-add", domain: "number_operations", difficulty: 2, status: "inactive" });
  expect(screen.getAllByRole("combobox", { name: "知识点" })[0]).toHaveValue("skill-add");
  expect(screen.getByRole("combobox", { name: "领域" })).toHaveValue("number_operations");
  expect(screen.getAllByRole("combobox", { name: "难度" })[0]).toHaveValue("2");
  expect(screen.getAllByRole("combobox", { name: "状态" })[0]).toHaveValue("inactive");
  expect(screen.getAllByTestId("question-bank-item")).toHaveLength(100);
});

test("continues with existing inventory when weekly refresh fails", async () => {
  ensureQuestionBankFresh.mockImplementation(() => { throw new Error("refresh unavailable"); });

  render(await ParentQuestionsPage({ searchParams: Promise.resolve({}) }));

  expect(screen.getAllByText("0 + 1 = ?").length).toBeGreaterThan(0);
  expect(screen.getByText(/刷新失败/)).toBeInTheDocument();
});

test("shows question details and provenance timestamps", async () => {
  listQuestionBank.mockReturnValue([{
    ...row(8),
    generatedAt: Date.UTC(2026, 0, 2, 1),
    updatedAt: Date.UTC(2026, 0, 3, 1),
    lastUsedAt: Date.UTC(2026, 0, 4, 1),
  }]);

  const { container } = render(await ParentQuestionsPage({ searchParams: Promise.resolve({}) }));

  expect(screen.getByText("8 + 1 = ?")).toBeInTheDocument();
  expect(screen.getByText("正确答案")).toBeInTheDocument();
  expect(screen.getByText("9")).toBeInTheDocument();
  expect(screen.getByText("计算即可")).toBeInTheDocument();
  expect(screen.getByText("题目来源")).toBeInTheDocument();
  expect(screen.getByText("加法")).toBeInTheDocument();
  expect(screen.getByText("生成时间")).toBeInTheDocument();
  expect(screen.getByText("最近更新时间")).toBeInTheDocument();
  expect(screen.getByText("最近使用")).toBeInTheDocument();
  expect(container.querySelector('time[dateTime="2026-01-02T01:00:00.000Z"]')).toBeInTheDocument();
  expect(container.querySelector('time[dateTime="2026-01-03T01:00:00.000Z"]')).toBeInTheDocument();
  expect(screen.getByText("2026年1月4日 09:00")).toBeInTheDocument();
});
