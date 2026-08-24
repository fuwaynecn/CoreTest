import { render, screen } from "@testing-library/react";
import { TrainingSegments } from "./training-segments";

test("marks the current four-part training segment", () => {
  render(<TrainingSegments current="reading" composition={{ warmup: 4, core: 8, reading: 4, correction: 2 }} />);
  expect(screen.getByText("旧知识唤醒")).toHaveAttribute("aria-current", "false");
  expect(screen.getByText("审题专项")).toHaveAttribute("aria-current", "step");
});
