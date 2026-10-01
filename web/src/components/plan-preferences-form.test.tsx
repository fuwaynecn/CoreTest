import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { PlanPreferencesForm } from "./plan-preferences-form";

test("blocks four training days before submitting", async () => {
  const user = userEvent.setup();
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  render(<PlanPreferencesForm childId="child-1" initial={{ trainingWeekdays: [1, 2, 3, 4, 5], targetMinutes: 30, specialistFocus: "equation" }} />);
  await user.click(screen.getByLabelText("周五"));
  await user.click(screen.getByRole("button", { name: "保存并更新计划" }));
  expect(screen.getByRole("alert")).toHaveTextContent("恰好 5 个训练日");
  expect(fetchMock).not.toHaveBeenCalled();
});

test("shows Chinese guidance when saving preferences loses the network", async () => {
  const user = userEvent.setup();
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  render(<PlanPreferencesForm childId="child-1" initial={{ trainingWeekdays: [1, 2, 3, 4, 5], targetMinutes: 30, specialistFocus: "equation" }} />);
  await user.click(screen.getByRole("button", { name: "保存并更新计划" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("网络连接失败");
});

test("sends childId in the request body on submit", async () => {
  const user = userEvent.setup();
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ plan: {} }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  render(<PlanPreferencesForm childId="kid-42" initial={{ trainingWeekdays: [1, 2, 3, 4, 5], targetMinutes: 30, specialistFocus: "none" }} />);
  await user.click(screen.getByRole("button", { name: "保存并更新计划" }));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const body = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(body.childId).toBe("kid-42");
  expect(body.trainingWeekdays).toEqual([1, 2, 3, 4, 5]);
});
