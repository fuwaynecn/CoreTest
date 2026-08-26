import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readDraft, readSubmissionQueue } from "@/services/offline/offline-store";
import { DiagnosisAnswerForm } from "./diagnosis-answer-form";
import { DiagnosisProgress } from "./diagnosis-progress";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
});

test("uses the formal hint ladder and records only visible focused diagnosis time", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  let visible = true;
  let focused = true;
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => (
    visible ? "visible" : "hidden"
  ));
  vi.spyOn(document, "hasFocus").mockImplementation(() => focused);
  const requestHint = vi.fn().mockResolvedValue({ level: 1, hint: "先圈出已知条件。", hintCount: 1 });
  const submit = vi.fn().mockResolvedValue({
    correct: true,
    normalizedAnswer: "6",
    explanation: "正确。",
    diagnosis: { runId: "run-1", status: "in_progress", completedSlots: 1 },
  });

  render(<DiagnosisAnswerForm
    sessionItemId="item-1"
    runId="run-1"
    submitAnswer={submit}
    requestHint={requestHint}
  />);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "查看提示" }));
    await Promise.resolve();
  });
  expect(screen.getByText("先圈出已知条件。")).toBeVisible();
  fireEvent.change(screen.getByLabelText("你的答案"), { target: { value: "6" } });
  act(() => { vi.advanceTimersByTime(1_000); });
  visible = false;
  fireEvent(document, new Event("visibilitychange"));
  act(() => { vi.advanceTimersByTime(4_000); });
  visible = true;
  fireEvent(document, new Event("visibilitychange"));
  act(() => { vi.advanceTimersByTime(500); });
  focused = false;
  fireEvent.blur(window);
  act(() => { vi.advanceTimersByTime(3_000); });
  focused = true;
  fireEvent.focus(window);
  act(() => { vi.advanceTimersByTime(250); });

  fireEvent.submit(screen.getByRole("button", { name: "提交答案" }).closest("form")!);
  await act(async () => { await Promise.resolve(); });

  expect(submit).toHaveBeenCalledWith(expect.objectContaining({
    activeDurationMs: 1_750,
    hintLevel: 1,
    hintCount: 1,
  }));
  expect(requestHint).toHaveBeenCalledWith("item-1", expect.stringMatching(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  ));
});

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

test("queues an uncertain diagnosis submission with the same id", async () => {
  const uncertain = vi.fn()
    .mockRejectedValueOnce(new Error("offline"));
  const view = render(<DiagnosisAnswerForm sessionItemId="item-1" runId="run-1" submitAnswer={uncertain} />);
  await userEvent.type(screen.getByLabelText("你的答案"), "6");
  await userEvent.click(screen.getByRole("button", { name: "提交答案" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("已暂存，网络恢复后会自动提交。");
  expect(JSON.parse(readSubmissionQueue()[0].body)).toMatchObject({
    clientSubmissionId: uncertain.mock.calls[0][0].clientSubmissionId,
  });

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

test("queues the submission after a 503 response", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: "暂时不可用" }), { status: 503 }));
  render(<DiagnosisAnswerForm sessionItemId="item-503" runId="run-1" />);

  await userEvent.type(screen.getByLabelText("你的答案"), "6");
  await userEvent.click(screen.getByRole("button", { name: "提交答案" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("已暂存，网络恢复后会自动提交。");

  const first = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
  expect(JSON.parse(readSubmissionQueue()[0].body).clientSubmissionId).toBe(first.clientSubmissionId);
});

test("queues the submission after a malformed 2xx response", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify({ correct: true })));
  render(<DiagnosisAnswerForm sessionItemId="item-malformed" runId="run-1" />);

  await userEvent.type(screen.getByLabelText("你的答案"), "6");
  await userEvent.click(screen.getByRole("button", { name: "提交答案" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("已暂存，网络恢复后会自动提交。");

  const first = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
  expect(JSON.parse(readSubmissionQueue()[0].body).clientSubmissionId).toBe(first.clientSubmissionId);
});

test("restores and updates the saved diagnosis draft", async () => {
  localStorage.setItem("math-offline:draft:item-1", JSON.stringify({
    sessionItemId: "item-1",
    answerText: "12",
    updatedAt: 10,
  }));

  render(<DiagnosisAnswerForm sessionItemId="item-1" runId="run-1" />);

  const answer = screen.getByLabelText("你的答案");
  expect(answer).toHaveValue("12");

  await userEvent.clear(answer);
  await userEvent.type(answer, "18");

  expect(readDraft("item-1")).toMatchObject({
    sessionItemId: "item-1",
    answerText: "18",
  });
});

test("queues an uncertain diagnosis submission for online retry with the original submission id", async () => {
  const submit = vi.fn().mockRejectedValueOnce(new Error("offline"));
  render(<DiagnosisAnswerForm sessionItemId="item-1" runId="run-1" submitAnswer={submit} />);

  const answer = screen.getByLabelText("你的答案");
  await userEvent.type(answer, "6");
  await userEvent.click(screen.getByRole("button", { name: "提交答案" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("已暂存，网络恢复后会自动提交");
  expect(answer).toHaveValue("6");
  expect(readSubmissionQueue()).toEqual([
    expect.objectContaining({
      endpoint: "/api/child/diagnosis",
      clientSubmissionId: submit.mock.calls[0][0].clientSubmissionId,
    }),
  ]);
  expect(JSON.parse(readSubmissionQueue()[0].body)).toMatchObject({
    sessionItemId: "item-1",
    answerText: "6",
    clientSubmissionId: submit.mock.calls[0][0].clientSubmissionId,
  });
});

test("does not queue a definite diagnosis error", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
    error: "需要修改后重试",
  }), { status: 403 }));

  render(<DiagnosisAnswerForm sessionItemId="item-1" runId="run-1" />);

  await userEvent.type(screen.getByLabelText("你的答案"), "6");
  await userEvent.click(screen.getByRole("button", { name: "提交答案" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("需要修改后重试");
  expect(readSubmissionQueue()).toEqual([]);
});
