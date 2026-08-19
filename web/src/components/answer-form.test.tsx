import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AnswerForm } from "./answer-form";

afterEach(() => vi.restoreAllMocks());

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

test("offers the next question after a correct answer", async () => {
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
  expect(screen.getByRole("link", { name: "下一题" })).toHaveAttribute(
    "href",
    "/child/session/session-1",
  );
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
});

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
