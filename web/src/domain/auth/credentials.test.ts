import { hashCredential, verifyCredential } from "./credentials";

test("verifies the original credential and rejects a different value", async () => {
  const encoded = await hashCredential("safe-parent-password");
  expect(await verifyCredential("safe-parent-password", encoded)).toBe(true);
  expect(await verifyCredential("wrong-password", encoded)).toBe(false);
  expect(encoded).not.toContain("safe-parent-password");
});
