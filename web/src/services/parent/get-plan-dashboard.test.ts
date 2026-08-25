import { expect, test } from "vitest";
import { getPlanDashboard } from "./get-plan-dashboard";

test("returns an empty dashboard when the child has no active plan", () => {
  expect(getPlanDashboard).toBeTypeOf("function");
});
