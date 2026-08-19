import { render, screen } from "@testing-library/react";
import Home from "./page";

test("presents the family math trainer entry", () => {
  render(<Home />);
  expect(screen.getByRole("heading", { name: "每天认真一点，数学更稳一点" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "进入系统" })).toHaveAttribute("href", "/login");
});
