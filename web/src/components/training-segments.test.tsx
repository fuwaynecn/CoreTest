import { act, render, screen } from "@testing-library/react";
import { StopSessionButton, TrainingSegments } from "./training-segments";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

test("marks the current four-part training segment", () => {
  render(<TrainingSegments current="reading" composition={{ warmup: 4, core: 8, reading: 4, correction: 2 }} />);
  expect(screen.getByRole("navigation", { name: "今天的训练进度" })).toBeInTheDocument();
  expect(screen.getByText("旧知识唤醒")).toHaveAttribute("aria-current", "false");
  expect(screen.getByText("审题专项")).toHaveAttribute("aria-current", "step");
});

test("shows the target-time stop prompt when the session reaches its target", () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  render(<StopSessionButton sessionId="session-1" sessionItemIds={[]} targetAt={1_000} />);
  expect(screen.queryByText("今天的目标时间到了，可以先到这里。" )).not.toBeInTheDocument();
  act(() => { vi.advanceTimersByTime(1_000); });
  expect(screen.getByText("今天的目标时间到了，可以先到这里。")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "今天先到这里" })).toBeInTheDocument();
  vi.useRealTimers();
});
