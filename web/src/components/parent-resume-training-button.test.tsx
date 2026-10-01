import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ParentResumeTrainingButton } from "./parent-resume-training-button";

afterEach(() => vi.restoreAllMocks());

test("resumes the session and refreshes the parent page", async () => {
  const refresh = vi.fn();
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ status: "in_progress" }), { status: 200 }));
  render(<ParentResumeTrainingButton childId="child-1" sessionId="today" refresh={refresh} />);

  await userEvent.click(screen.getByRole("button", { name: "恢复当前训练" }));

  expect(fetchSpy).toHaveBeenCalledWith("/api/parent/sessions/today/resume", expect.objectContaining({
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ childId: "child-1" }),
  }));
  expect(refresh).toHaveBeenCalledTimes(1);
});

test("shows not_your_child error when server rejects ownership", async () => {
  const refresh = vi.fn();
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
    error: { code: "not_your_child", message: "不能操作别家孩子" },
  }), { status: 403 }));
  render(<ParentResumeTrainingButton childId="child-other" sessionId="today" refresh={refresh} />);

  await userEvent.click(screen.getByRole("button", { name: "恢复当前训练" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("不能操作别家孩子");
  expect(refresh).not.toHaveBeenCalled();
});
