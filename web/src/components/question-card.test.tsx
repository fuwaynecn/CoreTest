import { render, screen } from "@testing-library/react";
import { QuestionCard } from "./question-card";

test("exposes the question card as a named region with a reading cue", () => {
  render(<QuestionCard stem="小明有 6 个苹果。" />);

  expect(screen.getByRole("region", { name: "仔细读题" })).toBeInTheDocument();
  expect(screen.getByText("仔细读题")).toBeInTheDocument();
});
