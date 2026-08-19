import { render, screen } from "@testing-library/react";
import Home from "./page";

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn().mockResolvedValue(null),
}));

test("presents the family math trainer entry", async () => {
  render(await Home());
  expect(screen.getByRole("heading", { name: "每天认真一点，数学更稳一点" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "进入系统" })).toHaveAttribute("href", "/login");
});
