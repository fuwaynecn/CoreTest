import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ParentResumeTrainingButton } from "./parent-resume-training-button";

afterEach(() => vi.restoreAllMocks());

test("resumes the session and refreshes the parent page", async () => {
  const refresh = vi.fn();
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ status: "in_progress" }), { status: 200 }));
  render(<ParentResumeTrainingButton sessionId="today" refresh={refresh} />);

  await userEvent.click(screen.getByRole("button", { name: "恢复当前训练" }));

  expect(fetchSpy).toHaveBeenCalledWith("/api/parent/sessions/today/resume", { method: "POST" });
  expect(refresh).toHaveBeenCalledTimes(1);
});
