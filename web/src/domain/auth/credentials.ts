import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const SALT_BYTES = 16;
const KEY_BYTES = 64;

async function deriveKey(value: string, salt: Buffer) {
  return (await scryptAsync(value, salt, KEY_BYTES)) as Buffer;
}

export async function hashCredential(value: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await deriveKey(value, salt);

  return `scrypt:${salt.toString("hex")}:${key.toString("hex")}`;
}

export async function verifyCredential(value: string, encoded: string): Promise<boolean> {
  const parts = encoded.split(":");

  if (
    parts.length !== 3 ||
    parts[0] !== "scrypt" ||
    !/^[0-9a-f]{32}$/.test(parts[1]) ||
    !/^[0-9a-f]{128}$/.test(parts[2])
  ) {
    return false;
  }

  const salt = Buffer.from(parts[1], "hex");
  const expectedKey = Buffer.from(parts[2], "hex");
  const actualKey = await deriveKey(value, salt);

  return timingSafeEqual(actualKey, expectedKey);
}
