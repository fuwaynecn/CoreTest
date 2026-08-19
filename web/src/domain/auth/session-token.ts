import { createHash, randomBytes } from "node:crypto";

export function hashSessionToken(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

export function createSessionToken() {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashSessionToken(raw) };
}
