import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuestionBankEditor } from "./question-bank-editor";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const baseRow = {
  id: "instance-1", stem: "3 + 4 = ?", answerSpec: { kind: "number" as const, value: 7, tolerance: 0, unit: null }, explanation: "相加", skillId: "skill-add", skillCode: "add", skillName: "整数加法",
  domain: "number_operations" as const, difficulty: 1 as const, active: true, status: "active" as const, templateId: "template-1", templateName: "加法", structureTag: "addition", answerMode: "written" as const,
  generatedAt: 1, updatedAt: 2, lastUsedAt: null, usage: [],
};

test("edits friendly fields, saves the complete row payload, and toggles active without delete", async () => {
  const user = userEvent.setup();
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ question: baseRow }), { status: 200 }));
  render(<QuestionBankEditor row={baseRow} />);

  await user.clear(screen.getByLabelText("题干"));
  await user.type(screen.getByLabelText("题干"), "3 + 5 = ?");
  await user.clear(screen.getByLabelText("正确答案"));
  await user.type(screen.getByLabelText("正确答案"), "8");
  await user.type(screen.getByLabelText("可选单位"), "个");
  await user.clear(screen.getByLabelText("解析"));
  await user.type(screen.getByLabelText("解析"), "先算加法");
  await user.selectOptions(screen.getByLabelText("难度"), "3");
  await user.click(screen.getByLabelText("启用状态"));
  await user.click(screen.getByRole("button", { name: "保存" }));

  expect(fetchMock).toHaveBeenCalledWith("/api/parent/questions/instance-1", expect.objectContaining({
    method: "PATCH",
    body: JSON.stringify({ stem: "3 + 5 = ?", answerSpec: { kind: "number", value: 8, tolerance: 0, unit: "个" }, explanation: "先算加法", skillId: "skill-add", difficulty: 3, active: false }),
  }));
  expect(await screen.findByText("已保存")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /删除/ })).not.toBeInTheDocument();
  fetchMock.mockRestore();
});

test("associates invalid question errors with stem and answer controls", async () => {
  const user = userEvent.setup();
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: { code: "invalid_question", message: "题干与答案不匹配" } }), { status: 400 }));
  render(<QuestionBankEditor row={baseRow} />);

  await user.click(screen.getByRole("button", { name: "保存" }));

  const error = await screen.findByRole("alert");
  expect(error).toHaveTextContent("题干与答案不匹配");
  expect(error).toHaveAttribute("id", "question-bank-error-instance-1");
  expect(screen.getByLabelText("题干")).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByLabelText("题干")).toHaveAttribute("aria-describedby", error.id);
  expect(screen.getByLabelText("正确答案")).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByLabelText("正确答案")).toHaveAttribute("aria-describedby", error.id);

  await user.type(screen.getByLabelText("题干"), " ");
  expect(screen.getByLabelText("题干")).not.toHaveAttribute("aria-invalid");
  expect(screen.getByLabelText("正确答案")).not.toHaveAttribute("aria-invalid");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  fetchMock.mockRestore();
});

test("maps server reasons to the affected stem, answer, and unit fields", async () => {
  const user = userEvent.setup();
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: {
    code: "invalid_question",
    message: "题库题目参数无效",
    reasons: [
      { code: "incorrect_number_answer", field: "answer" },
      { code: "missing_unit", field: "unit" },
    ],
  } }), { status: 400 }));
  render(<QuestionBankEditor row={baseRow} />);

  await user.click(screen.getByRole("button", { name: "保存" }));

  expect(await screen.findByText("答案与题干不匹配")).toBeInTheDocument();
  expect(screen.getByText("请填写单位")).toBeInTheDocument();
  expect(screen.getByLabelText("题干")).not.toHaveAttribute("aria-invalid", "true");
  expect(screen.getByLabelText("正确答案")).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByLabelText("可选单位")).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByText("答案与题干不匹配")).toHaveAttribute("id", "question-bank-error-instance-1-answer");
  expect(screen.getByText("请填写单位")).toHaveAttribute("id", "question-bank-error-instance-1-unit");
  expect(screen.getByLabelText("正确答案")).toHaveAttribute("aria-describedby", "question-bank-error-instance-1-answer question-bank-error-instance-1");
  expect(screen.getByLabelText("可选单位")).toHaveAttribute("aria-describedby", "question-bank-error-instance-1-unit question-bank-error-instance-1");
  fetchMock.mockRestore();
});

test("clears the field error when a non-answer field is edited", async () => {
  const user = userEvent.setup();
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: { code: "invalid_question", message: "题干与答案不匹配" } }), { status: 400 }));
  render(<QuestionBankEditor row={baseRow} />);

  await user.click(screen.getByRole("button", { name: "保存" }));
  await screen.findByRole("alert");
  await user.selectOptions(screen.getByLabelText("难度"), "2");

  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByLabelText("题干")).not.toHaveAttribute("aria-invalid");
  expect(screen.getByLabelText("正确答案")).not.toHaveAttribute("aria-invalid");
  fetchMock.mockRestore();
});
