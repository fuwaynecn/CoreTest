import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AnswerForm } from "./answer-form";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test("counts active time only while the page is visible and focused", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  let visible = true;
  let focused = true;
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => (
    visible ? "visible" : "hidden"
  ));
  vi.spyOn(document, "hasFocus").mockImplementation(() => focused);
  const submit = vi.fn().mockResolvedValue({
    correct: true,
    normalizedAnswer: "6",
    explanation: "解析",
    sessionCompleted: false,
  });

  render(<AnswerForm sessionItemId="item-1" submitAnswer={submit} />);
  fireEvent.change(screen.getByLabelText("你的答案"), { target: { value: "6" } });

  act(() => { vi.advanceTimersByTime(1_000); });
  visible = false;
  fireEvent(document, new Event("visibilitychange"));
  act(() => { vi.advanceTimersByTime(5_000); });
  visible = true;
  fireEvent(document, new Event("visibilitychange"));
  act(() => { vi.advanceTimersByTime(500); });
  focused = false;
  fireEvent.blur(window);
  act(() => { vi.advanceTimersByTime(4_000); });
  focused = true;
  fireEvent.focus(window);
  act(() => { vi.advanceTimersByTime(250); });

  fireEvent.submit(screen.getByRole("button", { name: "提交答案" }).closest("form")!);
  await act(async () => { await Promise.resolve(); });

  expect(submit).toHaveBeenCalledWith(expect.objectContaining({
    activeDurationMs: 1_750,
    hintLevel: 0,
    hintCount: 0,
  }));
});

test("shows sequential hints and submits the server-confirmed hint facts", async () => {
  const requestHint = vi.fn()
    .mockResolvedValueOnce({ level: 1, hint: "方向提示", hintCount: 1 })
    .mockResolvedValueOnce({ level: 2, hint: "关系提示", hintCount: 2 })
    .mockResolvedValueOnce({ level: 3, hint: "步骤提示", hintCount: 3 })
    .mockResolvedValueOnce({ level: 3, hint: "步骤提示", hintCount: 3 });
  const submit = vi.fn().mockResolvedValue({
    correct: true,
    normalizedAnswer: "6",
    explanation: "解析",
    sessionCompleted: false,
  });
  render(<AnswerForm sessionItemId="item-1" submitAnswer={submit} requestHint={requestHint} />);

  const hintButton = screen.getByRole("button", { name: "查看提示" });
  for (const text of ["方向提示", "关系提示", "步骤提示", "步骤提示"]) {
    await userEvent.click(hintButton);
    expect(await screen.findByText(text)).toBeInTheDocument();
  }
  expect(requestHint).toHaveBeenCalledTimes(4);
  expect(new Set(requestHint.mock.calls.map((call) => call[1])).size).toBe(4);

  await userEvent.type(screen.getByLabelText("你的答案"), "6");
  await userEvent.click(screen.getByRole("button", { name: "提交答案" }));
  expect(submit).toHaveBeenCalledWith(expect.objectContaining({ hintLevel: 3, hintCount: 3 }));
});

test.each([500, 502, 503, 504])(
  "retries an uncertain hint request with the same request id after %s",
  async (status) => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "temporary" }), { status }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        level: 1, hint: "方向提示", hintCount: 1,
      })));
    render(<AnswerForm sessionItemId="item-hint" />);

    await userEvent.click(screen.getByRole("button", { name: "查看提示" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("提示暂时无法加载");
    await userEvent.click(screen.getByRole("button", { name: "查看提示" }));
    expect(await screen.findByText("方向提示")).toBeVisible();

    const first = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
    const retry = JSON.parse(fetchSpy.mock.calls[1][1]?.body as string);
    expect(retry.requestId).toBe(first.requestId);
    expect(first.requestId).toMatch(/^[0-9a-f-]{36}$/i);
  },
);

test.each([400, 401, 403, 404])(
  "allocates a new hint request id after a definite %s response",
  async (status) => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "definite" }), { status }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        level: 1, hint: "方向提示", hintCount: 1,
      })));
    render(<AnswerForm sessionItemId="item-hint" />);

    await userEvent.click(screen.getByRole("button", { name: "查看提示" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("definite");
    await userEvent.click(screen.getByRole("button", { name: "查看提示" }));
    expect(await screen.findByText("方向提示")).toBeVisible();

    const first = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
    const second = JSON.parse(fetchSpy.mock.calls[1][1]?.body as string);
    expect(second.requestId).not.toBe(first.requestId);
  },
);

test("stops active timing after unmount", () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  const removeSpy = vi.spyOn(window, "removeEventListener");
  const { unmount } = render(<AnswerForm sessionItemId="item-1" />);

  act(() => { vi.advanceTimersByTime(100); });
  unmount();
  act(() => { vi.advanceTimersByTime(100); });

  expect(removeSpy).toHaveBeenCalledWith("focus", expect.any(Function));
  expect(removeSpy).toHaveBeenCalledWith("blur", expect.any(Function));
});

test("shows correction feedback returned by the server", async () => {
  const submit = vi.fn().mockResolvedValue({
    correct: false,
    normalizedAnswer: "6",
    explanation: "把十分位对齐后再相加。",
    sessionCompleted: false,
  });

  render(<AnswerForm sessionItemId="item-1" submitAnswer={submit} />);

  await userEvent.type(screen.getByLabelText("你的答案"), "5");
  await userEvent.click(screen.getByRole("button", { name: "提交答案" }));

  expect(await screen.findByText("再看一步")).toBeInTheDocument();
  expect(screen.getByText("把十分位对齐后再相加。")).toBeInTheDocument();
});

test("offers a navigation action after a correct answer", async () => {
  const submit = vi.fn().mockResolvedValue({
    correct: true,
    normalizedAnswer: "6",
    explanation: "把十分位对齐后再相加。",
    sessionCompleted: false,
  });

  render(
    <AnswerForm
      sessionItemId="item-1"
      submitAnswer={submit}
      nextHref="/child/session/session-1"
    />,
  );

  await userEvent.type(screen.getByLabelText("你的答案"), "6");
  await userEvent.click(screen.getByRole("button", { name: "提交答案" }));

  expect(await screen.findByText("做对了，别忘了检查题目问的是什么。")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "下一题" })).toBeInTheDocument();
});

test("retries an interrupted submission with the same id", async () => {
  const submit = vi.fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce({
      correct: true,
      normalizedAnswer: "6",
      explanation: "把十分位对齐后再相加。",
      sessionCompleted: false,
    });

  render(<AnswerForm sessionItemId="item-1" submitAnswer={submit} />);

  const answer = screen.getByLabelText("你的答案");
  await userEvent.type(answer, "6");
  await userEvent.click(screen.getByRole("button", { name: "提交答案" }));
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("提交没有成功，请重试。");
  expect(alert).not.toHaveTextContent("offline");
  expect(answer).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "重试提交" }));

  expect(await screen.findByText("做对了，别忘了检查题目问的是什么。")).toBeInTheDocument();
  expect(submit.mock.calls[1][0].clientSubmissionId).toBe(submit.mock.calls[0][0].clientSubmissionId);
  expect(submit.mock.calls[1][0]).toMatchObject({
    activeDurationMs: submit.mock.calls[0][0].activeDurationMs,
    hintLevel: submit.mock.calls[0][0].hintLevel,
    hintCount: submit.mock.calls[0][0].hintCount,
  });
});

test("offers four large reflection choices and a skip after a correction", async () => {
  const submit = vi.fn()
    .mockResolvedValueOnce({ correct: false, normalizedAnswer: "5", explanation: "再算一次。", sessionCompleted: false })
    .mockResolvedValueOnce({ correct: true, normalizedAnswer: "6", explanation: "再算一次。", sessionCompleted: false });
  const saveReflection = vi.fn().mockResolvedValue(undefined);
  render(<AnswerForm sessionItemId="item-1" submitAnswer={submit} saveReflection={saveReflection} />);

  await userEvent.type(screen.getByLabelText("你的答案"), "5");
  await userEvent.click(screen.getByRole("button", { name: "提交答案" }));
  await userEvent.click(await screen.findByRole("button", { name: "修改答案" }));
  await userEvent.clear(screen.getByLabelText("你的答案"));
  await userEvent.type(screen.getByLabelText("你的答案"), "6");
  await userEvent.click(screen.getByRole("button", { name: "提交答案" }));

  for (const label of ["没看清问题", "漏了条件或单位", "会做但算错", "方法不会", "暂时不选"]) {
    expect(await screen.findByRole("button", { name: label })).toBeInTheDocument();
  }
  await userEvent.click(screen.getByRole("button", { name: "会做但算错" }));
  expect(saveReflection).toHaveBeenCalledWith({ sessionItemId: "item-1", reflection: "calculation_slip" });
  expect(await screen.findByRole("button", { name: "下一题" })).toBeInTheDocument();
});

test.each([500, 502, 503, 504])(
  "keeps the submission id and telemetry locked after an uncertain %s response",
  async (status) => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "temporary" }), { status }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        correct: true,
        normalizedAnswer: "6",
        explanation: "解析",
        sessionCompleted: false,
      })));
    render(<AnswerForm sessionItemId="item-1" />);

    const answer = screen.getByLabelText("你的答案");
    await userEvent.type(answer, "6");
    await userEvent.click(screen.getByRole("button", { name: "提交答案" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("提交没有成功，请重试。");
    expect(answer).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "重试提交" }));
    expect(await screen.findByText("做对了，别忘了检查题目问的是什么。")).toBeInTheDocument();

    const first = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
    const retry = JSON.parse(fetchSpy.mock.calls[1][1]?.body as string);
    expect(retry).toMatchObject({
      clientSubmissionId: first.clientSubmissionId,
      activeDurationMs: first.activeDurationMs,
      hintLevel: first.hintLevel,
      hintCount: first.hintCount,
    });
  },
);

test.each([400, 401, 403, 404])(
  "unlocks editing and uses a new submission id after a certain %s response",
  async (status) => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "确定失败" }), { status }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        correct: true,
        normalizedAnswer: "6",
        explanation: "解析",
        sessionCompleted: false,
      })));
    render(<AnswerForm sessionItemId="item-1" />);

    const answer = screen.getByLabelText("你的答案");
    await userEvent.type(answer, "6");
    await userEvent.click(screen.getByRole("button", { name: "提交答案" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("确定失败");
    expect(answer).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "提交答案" }));
    expect(await screen.findByText("做对了，别忘了检查题目问的是什么。")).toBeInTheDocument();
    const first = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
    const second = JSON.parse(fetchSpy.mock.calls[1][1]?.body as string);
    expect(second.clientSubmissionId).not.toBe(first.clientSubmissionId);
  },
);

test("posts an answer to the attempt endpoint by default", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
    correct: true,
    normalizedAnswer: "6",
    explanation: "把十分位对齐后再相加。",
    sessionCompleted: false,
  })));

  render(<AnswerForm sessionItemId="item-1" />);

  await userEvent.type(screen.getByLabelText("你的答案"), "6");
  await userEvent.click(screen.getByRole("button", { name: "提交答案" }));

  expect(await screen.findByText("做对了，别忘了检查题目问的是什么。")).toBeInTheDocument();
  expect(fetchSpy).toHaveBeenCalledWith("/api/child/attempts", expect.objectContaining({
    method: "POST",
    body: expect.stringContaining('"answerText":"6"'),
  }));
  fetchSpy.mockRestore();
});

test("allows a revised answer after a 400 response with a new submission id", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: "Invalid attempt input" }), { status: 400 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({
      correct: true,
      normalizedAnswer: "6",
      explanation: "把十分位对齐后再相加。",
      sessionCompleted: false,
    })));

  render(<AnswerForm sessionItemId="item-1" />);

  const answer = screen.getByLabelText("你的答案");
  await userEvent.type(answer, "1".repeat(129));
  await userEvent.click(screen.getByRole("button", { name: "提交答案" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Invalid attempt input");
  expect(answer).toBeEnabled();

  await userEvent.clear(answer);
  await userEvent.type(answer, "6");
  await userEvent.click(screen.getByRole("button", { name: "提交答案" }));

  expect(await screen.findByText("做对了，别忘了检查题目问的是什么。")).toBeInTheDocument();
  const firstPayload = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
  const secondPayload = JSON.parse(fetchSpy.mock.calls[1][1]?.body as string);
  expect(secondPayload.clientSubmissionId).not.toBe(firstPayload.clientSubmissionId);
});

test("shows the safe 404 response error without trapping the answer field", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
    error: "Training item not found",
  }), { status: 404 }));

  render(<AnswerForm sessionItemId="item-1" />);

  const answer = screen.getByLabelText("你的答案");
  await userEvent.type(answer, "6");
  await userEvent.click(screen.getByRole("button", { name: "提交答案" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Training item not found");
  expect(answer).toBeEnabled();
});

test("unlocks the answer after an expired-session JSON response", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify({
      error: "Authentication required",
    }), { status: 401 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({
      correct: true,
      normalizedAnswer: "6",
      explanation: "把十分位对齐后再相加。",
      sessionCompleted: false,
    })));

  render(<AnswerForm sessionItemId="item-1" />);

  const answer = screen.getByLabelText("你的答案");
  await userEvent.type(answer, "6");
  await userEvent.click(screen.getByRole("button", { name: "提交答案" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Authentication required");
  expect(answer).toBeEnabled();

  await userEvent.click(screen.getByRole("button", { name: "提交答案" }));
  expect(await screen.findByText("做对了，别忘了检查题目问的是什么。")).toBeInTheDocument();
  const firstPayload = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
  const secondPayload = JSON.parse(fetchSpy.mock.calls[1][1]?.body as string);
  expect(secondPayload.clientSubmissionId).not.toBe(firstPayload.clientSubmissionId);
});

test("retries an unparseable 2xx response with the same id", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response("not JSON"))
    .mockResolvedValueOnce(new Response(JSON.stringify({
      correct: true,
      normalizedAnswer: "6",
      explanation: "把十分位对齐后再相加。",
      sessionCompleted: false,
    })));

  render(<AnswerForm sessionItemId="item-1" />);

  const answer = screen.getByLabelText("你的答案");
  await userEvent.type(answer, "6");
  await userEvent.click(screen.getByRole("button", { name: "提交答案" }));
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("提交没有成功，请重试。");
  expect(alert).not.toHaveTextContent("not JSON");
  expect(answer).toBeDisabled();

  await userEvent.click(screen.getByRole("button", { name: "重试提交" }));

  expect(await screen.findByText("做对了，别忘了检查题目问的是什么。")).toBeInTheDocument();
  const firstPayload = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
  const secondPayload = JSON.parse(fetchSpy.mock.calls[1][1]?.body as string);
  expect(secondPayload.clientSubmissionId).toBe(firstPayload.clientSubmissionId);
  expect(secondPayload).toMatchObject({
    activeDurationMs: firstPayload.activeDurationMs,
    hintLevel: firstPayload.hintLevel,
    hintCount: firstPayload.hintCount,
  });
});

test("includes a completed reading card with the first answer", async () => {
  const submit = vi.fn().mockResolvedValue({ correct: true, normalizedAnswer: "6", explanation: "解析", sessionCompleted: false });
  render(<AnswerForm sessionItemId="item-reading" readingCard submitAnswer={submit} />);
  for (const label of ["题目要我求什么", "已知了什么", "单位是什么", "哪些信息有用", "数量之间有什么关系", "答案大约在哪个范围"]) {
    await userEvent.type(screen.getByLabelText(label), "已填写");
  }
  await userEvent.type(screen.getByLabelText("你的答案"), "6");
  await userEvent.click(screen.getByRole("button", { name: "提交答案" }));
  expect(submit).toHaveBeenCalledWith(expect.objectContaining({ readingCardResponse: {
    target: "已填写", givens: "已填写", units: "已填写", usefulFacts: "已填写", relationship: "已填写", estimateRange: "已填写",
  } }));
});

test("retries an incomplete 2xx result with the same id", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify({ correct: true })))
    .mockResolvedValueOnce(new Response(JSON.stringify({
      correct: true,
      normalizedAnswer: "6",
      explanation: "把十分位对齐后再相加。",
      sessionCompleted: false,
    })));

  render(<AnswerForm sessionItemId="item-1" />);

  const answer = screen.getByLabelText("你的答案");
  await userEvent.type(answer, "6");
  await userEvent.click(screen.getByRole("button", { name: "提交答案" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("提交没有成功，请重试。");
  expect(answer).toBeDisabled();

  await userEvent.click(screen.getByRole("button", { name: "重试提交" }));

  expect(await screen.findByText("做对了，别忘了检查题目问的是什么。")).toBeInTheDocument();
  const firstPayload = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
  const secondPayload = JSON.parse(fetchSpy.mock.calls[1][1]?.body as string);
  expect(secondPayload.clientSubmissionId).toBe(firstPayload.clientSubmissionId);
});
