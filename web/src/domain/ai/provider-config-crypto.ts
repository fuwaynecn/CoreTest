import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const ENVELOPE_VERSION = "v1";
const NONCE_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const MIN_SECRET_LENGTH = 32;
const ALGORITHM = "aes-256-gcm";

function getMasterSecret(masterSecret?: string) {
  const secret = masterSecret ?? process.env.AI_CONFIG_ENCRYPTION_KEY;

  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error("AI_CONFIG_ENCRYPTION_KEY must be at least 32 characters");
  }

  return secret;
}

function deriveCipherKey(masterSecret?: string) {
  return createHash("sha256").update(getMasterSecret(masterSecret), "utf8").digest();
}

function decodeBase64Url(segment: string) {
  try {
    const value = Buffer.from(segment, "base64url");

    if (value.length === 0) {
      throw new Error("empty");
    }

    return value;
  } catch {
    throw new Error("Invalid API key envelope");
  }
}

export function encryptApiKey(apiKey: string, masterSecret?: string): string {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALGORITHM, deriveCipherKey(masterSecret), nonce);
  const ciphertext = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    ENVELOPE_VERSION,
    nonce.toString("base64url"),
    ciphertext.toString("base64url"),
    tag.toString("base64url"),
  ].join(".");
}

export function decryptApiKey(envelope: string, masterSecret?: string): string {
  const parts = envelope.split(".");

  if (parts.length !== 4) {
    throw new Error("Invalid API key envelope");
  }

  const [version, nonceSegment, ciphertextSegment, tagSegment] = parts;

  if (version !== ENVELOPE_VERSION) {
    throw new Error("Unsupported API key envelope version");
  }

  const nonce = decodeBase64Url(nonceSegment);
  const ciphertext = decodeBase64Url(ciphertextSegment);
  const tag = decodeBase64Url(tagSegment);

  if (nonce.length !== NONCE_BYTES || tag.length !== AUTH_TAG_BYTES) {
    throw new Error("Invalid API key envelope");
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, deriveCipherKey(masterSecret), nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Invalid API key envelope");
  }
}
