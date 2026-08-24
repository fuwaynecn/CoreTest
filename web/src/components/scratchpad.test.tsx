import { fireEvent, render, screen } from "@testing-library/react";
import { Scratchpad } from "./scratchpad";

test("restores a local draft by session item id after reload", () => {
  const { unmount } = render(<Scratchpad sessionItemId="item-1" />);
  fireEvent.change(screen.getByLabelText("草稿"), { target: { value: "列式：12 ÷ 3" } });
  expect(localStorage.getItem("math-scratch:item-1")).toBe("列式：12 ÷ 3");

  unmount();
  render(<Scratchpad sessionItemId="item-1" />);
  expect(screen.getByLabelText("草稿")).toHaveValue("列式：12 ÷ 3");
});
