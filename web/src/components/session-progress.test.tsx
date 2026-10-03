import { render, screen } from "@testing-library/react";
import { SessionProgress } from "./session-progress";

test("shows completed and remaining session questions", () => {
  render(<SessionProgress completed={4} total={15} />);

  expect(screen.getByText("已做 4 题 / 剩余 11 题")).toBeInTheDocument();
});
