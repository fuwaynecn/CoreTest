import { fireEvent, render, screen } from "@testing-library/react";
import { ReadingCard } from "./reading-card";

test("collects all six reading prompts as one response", () => {
  const onChange = vi.fn();
  render(<ReadingCard onChange={onChange} />);

  const fields = ["题目要我求什么", "已知了什么", "单位是什么", "哪些信息有用", "数量之间有什么关系", "答案大约在哪个范围"];
  for (const [index, label] of fields.entries()) {
    fireEvent.change(screen.getByLabelText(label), { target: { value: `答案${index + 1}` } });
  }

  expect(onChange).toHaveBeenLastCalledWith({
    target: "答案1", givens: "答案2", units: "答案3", usefulFacts: "答案4",
    relationship: "答案5", estimateRange: "答案6",
  });
});
