import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { PlanPreferencesForm } from "./plan-preferences-form";

test("blocks four training days before submitting", async () => {
  const user = userEvent.setup();
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  render(<PlanPreferencesForm initial={{ trainingWeekdays: [1, 2, 3, 4, 5], targetMinutes: 30, specialistFocus: "equation" }} />);
  await user.click(screen.getByLabelText("周五"));
  await user.click(screen.getByRole("button", { name: "保存并更新计划" }));
  expect(screen.getByRole("alert")).toHaveTextContent("恰好 5 个训练日");
  expect(fetchMock).not.toHaveBeenCalled();
});
