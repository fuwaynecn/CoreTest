import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DiagnosisAnswerForm } from "./diagnosis-answer-form";
import { DiagnosisProgress } from "./diagnosis-progress";

afterEach(() => vi.restoreAllMocks());

test("shows the persisted position in the three-part diagnosis", () => {
  render(<DiagnosisProgress part={2} completedInPart={7} totalInPart={15} />);

  expect(screen.getByText("第 2 部分，共 3 部分")).toBeVisible();
  expect(screen.getByText("本部分 7 / 15")).toBeVisible();
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "22");
});

test("prevents duplicate clicks and continues on the same run URL after a persisted result", async () => {
  let resolveSubmit!: (value: {
    correct: boolean;
    normalizedAnswer: string;
    explanation: string;
    diagnosis: { runId: string; status: "in_progress"; completedSlots: number };
  }) => void;
  const submit = vi.fn(() => new Promise<Parameters<typeof resolveSubmit>[0]>((resolve) => {
    resolveSubmit = resolve;
  }));
  const navigate = vi.fn();

  render(<DiagnosisAnswerForm sessionItemId="item-1" runId="run-1" submitAnswer={submit} navigate={navigate} />);
  await userEvent.type(screen.getByLabelText("你的答案"), "12");
  await userEvent.dblClick(screen.getByRole("button", { name: "提交答案" }));

  expect(submit).toHaveBeenCalledTimes(1);
  resolveSubmit({
    correct: false,
    normalizedAnswer: "12",
    explanation: "先看清问题问的量。",
    diagnosis: { runId: "run-1", status: "in_progress", completedSlots: 1 },
  });
  expect(await screen.findByText("这题已记录")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "下一题" }));
  expect(navigate).toHaveBeenCalledWith("/child/diagnosis/run-1");
});

test("uses semantic choice buttons and submits the selected label", async () => {
  const submit = vi.fn().mockResolvedValue({
    correct: true,
    normalizedAnswer: "B",
    explanation: "选择 B。",
    diagnosis: { runId: "run-1", status: "in_progress", completedSlots: 1 },
  });
  render(<DiagnosisAnswerForm
    sessionItemId="choice-item"
    runId="run-1"
    answerMode="choice"
    answerKind="choice"
    requiresUnit={false}
    choiceOptions={[
      { label: "A", text: "40" },
      { label: "B", text: "50" },
      { label: "C", text: "60" },
      { label: "D", text: "70" },
    ]}
    submitAnswer={submit}
  />);

  expect(screen.queryByRole("textbox", { name: "你的答案" })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "B. 50" }));
  expect(screen.getByRole("button", { name: "B. 50" })).toHaveAttribute("aria-pressed", "true");
  await userEvent.click(screen.getByRole("button", { name: "提交答案" }));

  expect(submit).toHaveBeenCalledWith(expect.objectContaining({ answerText: "B" }));
});

test("rejects a blank answer before allocating a permanent submission", async () => {
  const submit = vi.fn();
  render(<DiagnosisAnswerForm
    sessionItemId="blank-item"
    runId="run-1"
    answerMode="written"
    answerKind="number"
    requiresUnit={false}
    submitAnswer={submit}
  />);

  expect(screen.getByLabelText("你的答案")).toHaveAttribute("inputmode", "decimal");
  await userEvent.click(screen.getByRole("button", { name: "提交答案" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("请输入答案");
  expect(submit).not.toHaveBeenCalled();
});

test("keeps the text keyboard available when a number answer requires a unit", () => {
  render(<DiagnosisAnswerForm
    sessionItemId="unit-item"
    runId="run-1"
    answerMode="written"
    answerKind="number"
    requiresUnit
  />);

  expect(screen.getByLabelText("你的答案")).toHaveAttribute("inputmode", "text");
});

test("reuses the submission id only while success is uncertain", async () => {
  const uncertain = vi.fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce({
      correct: true,
      normalizedAnswer: "6",
      explanation: "正确。",
      diagnosis: { runId: "run-1", status: "in_progress", completedSlots: 1 },
    });
  const view = render(<DiagnosisAnswerForm sessionItemId="item-1" runId="run-1" submitAnswer={uncertain} />);
  await userEvent.type(screen.getByLabelText("你的答案"), "6");
  await userEvent.click(screen.getByRole("button", { name: "提交答案" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("提交状态还不能确认，请重试。");
  await userEvent.click(screen.getByRole("button", { name: "重试提交" }));
  expect(uncertain.mock.calls[1][0].clientSubmissionId).toBe(uncertain.mock.calls[0][0].clientSubmissionId);

  view.unmount();
  const rejected = vi.fn()
    .mockRejectedValueOnce(Object.assign(new Error("Invalid diagnosis attempt"), { certain: true }))
    .mockResolvedValueOnce({
      correct: true,
      normalizedAnswer: "7",
      explanation: "正确。",
      diagnosis: { runId: "run-1", status: "in_progress", completedSlots: 1 },
    });
  render(<DiagnosisAnswerForm sessionItemId="item-2" runId="run-1" submitAnswer={rejected} />);
  await userEvent.type(screen.getByLabelText("你的答案"), "7");
  await userEvent.click(screen.getByRole("button", { name: "提交答案" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Invalid diagnosis attempt");
  expect(screen.getByLabelText("你的答案")).toBeEnabled();
  await userEvent.click(screen.getByRole("button", { name: "提交答案" }));
  expect(rejected.mock.calls[1][0].clientSubmissionId).not.toBe(rejected.mock.calls[0][0].clientSubmissionId);
});

test.each([400, 401, 403])("uses a new submission id after a definite %s response", async (status) => {
  const fetchSpy = vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: "需要修改后重试" }), { status }))
    .mockResolvedValueOnce(new Response(JSON.stringify({
      correct: true,
      normalizedAnswer: "6",
      explanation: "正确。",
      diagnosis: { runId: "run-1", status: "in_progress", completedSlots: 1 },
    })));
  render(<DiagnosisAnswerForm sessionItemId="item-http" runId="run-1" />);

  await userEvent.type(screen.getByLabelText("你的答案"), "6");
  await userEvent.click(screen.getByRole("button", { name: "提交答案" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("需要修改后重试");
  expect(screen.getByLabelText("你的答案")).toBeEnabled();
  await userEvent.click(screen.getByRole("button", { name: "提交答案" }));

  const first = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
  const second = JSON.parse(fetchSpy.mock.calls[1][1]?.body as string);
  expect(second.clientSubmissionId).not.toBe(first.clientSubmissionId);
});

test("reuses the submission id after a 503 response", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: "暂时不可用" }), { status: 503 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({
      correct: true,
      normalizedAnswer: "6",
      explanation: "正确。",
      diagnosis: { runId: "run-1", status: "in_progress", completedSlots: 1 },
    })));
  render(<DiagnosisAnswerForm sessionItemId="item-503" runId="run-1" />);

  await userEvent.type(screen.getByLabelText("你的答案"), "6");
  await userEvent.click(screen.getByRole("button", { name: "提交答案" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("提交状态还不能确认，请重试。");
  expect(screen.getByLabelText("你的答案")).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "重试提交" }));

  const first = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
  const second = JSON.parse(fetchSpy.mock.calls[1][1]?.body as string);
  expect(second.clientSubmissionId).toBe(first.clientSubmissionId);
});

test("reuses the submission id after a malformed 2xx response", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify({ correct: true })))
    .mockResolvedValueOnce(new Response(JSON.stringify({
      correct: true,
      normalizedAnswer: "6",
      explanation: "正确。",
      diagnosis: { runId: "run-1", status: "in_progress", completedSlots: 1 },
    })));
  render(<DiagnosisAnswerForm sessionItemId="item-malformed" runId="run-1" />);

  await userEvent.type(screen.getByLabelText("你的答案"), "6");
  await userEvent.click(screen.getByRole("button", { name: "提交答案" }));
  await userEvent.click(await screen.findByRole("button", { name: "重试提交" }));

  const first = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
  const second = JSON.parse(fetchSpy.mock.calls[1][1]?.body as string);
  expect(second.clientSubmissionId).toBe(first.clientSubmissionId);
});
