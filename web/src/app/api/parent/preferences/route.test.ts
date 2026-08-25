import { expect, test } from "vitest";
import { POST } from "./route";

test("exports the parent preference endpoint", () => {
  expect(POST).toBeTypeOf("function");
});
