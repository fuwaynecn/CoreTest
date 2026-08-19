import { credentialInputSchema, hashCredential, verifyCredential } from "./credentials";

test.each([
  ["123", false],
  ["1234", true],
  ["x".repeat(128), true],
  ["x".repeat(129), false],
])("accepts only 4-128 character login and seed credentials", (value, accepted) => {
  expect(credentialInputSchema.safeParse(value).success).toBe(accepted);
});

test("verifies the original credential and rejects a different value", async () => {
  const encoded = await hashCredential("safe-parent-password");
  expect(await verifyCredential("safe-parent-password", encoded)).toBe(true);
  expect(await verifyCredential("wrong-password", encoded)).toBe(false);
  expect(encoded).not.toContain("safe-parent-password");
});

test.each([
  "",
  "pbkdf2:00112233445566778899aabbccddeeff:00",
  "scrypt:0011:00",
  `scrypt:${"g".repeat(32)}:${"0".repeat(128)}`,
  `scrypt:${"0".repeat(32)}:${"0".repeat(126)}`,
])("rejects malformed credential encoding: %s", async (encoded) => {
  expect(await verifyCredential("safe-parent-password", encoded)).toBe(false);
});
