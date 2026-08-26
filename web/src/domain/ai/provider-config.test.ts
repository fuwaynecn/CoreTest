import { decryptApiKey, encryptApiKey } from "./provider-config-crypto";
import {
  AI_PROVIDERS,
  maskApiKey,
  validateAiProviderConfig,
} from "./provider-config";

const MASTER_SECRET = "0123456789abcdef0123456789abcdef";

test("encrypts with AES-GCM and decrypts with the same secret", () => {
  const envelope = encryptApiKey("sk-live-top-secret", MASTER_SECRET);

  expect(envelope).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  expect(envelope).not.toContain("sk-live-top-secret");
  expect(decryptApiKey(envelope, MASTER_SECRET)).toBe("sk-live-top-secret");
});

test("rejects a wrong secret and tampered ciphertext", () => {
  const envelope = encryptApiKey("sk-live-top-secret", MASTER_SECRET);
  const [version, nonce, ciphertext, tag] = envelope.split(".");
  const tamperedCiphertext = `${ciphertext.slice(0, -1)}${ciphertext.endsWith("A") ? "B" : "A"}`;

  expect(() => decryptApiKey(envelope, "fedcba9876543210fedcba9876543210")).toThrow(
    "Invalid API key envelope",
  );
  expect(() => decryptApiKey([version, nonce, tamperedCiphertext, tag].join("."), MASTER_SECRET))
    .toThrow("Invalid API key envelope");
});

test("rejects malformed envelopes and weak master secrets", () => {
  expect(() => encryptApiKey("sk-live-top-secret", "too-short-secret")).toThrow(
    "AI_CONFIG_ENCRYPTION_KEY must be at least 32 characters",
  );
  expect(() => decryptApiKey("v2.a.b.c", MASTER_SECRET)).toThrow("Unsupported API key envelope version");
  expect(() => decryptApiKey("v1.only-two-parts", MASTER_SECRET)).toThrow("Invalid API key envelope");
});

test("masks API keys with six bullets and the trailing four characters", () => {
  expect(maskApiKey("")).toBe("");
  expect(maskApiKey("sk-1234567890")).toBe("••••••7890");
});

test("accepts only the supported provider config shape", () => {
  expect(AI_PROVIDERS).toEqual(["openai", "deepseek"]);
  expect(validateAiProviderConfig({
    provider: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5-mini",
    enabled: true,
  })).toEqual({
    provider: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5-mini",
    enabled: true,
  });

  expect(() => validateAiProviderConfig({
    provider: "anthropic",
    baseUrl: "https://example.com",
    model: "claude",
    enabled: true,
  })).toThrow();
  expect(() => validateAiProviderConfig({
    provider: "deepseek",
    baseUrl: "file:///tmp/secret",
    model: "deepseek-chat",
    enabled: false,
  })).toThrow();
  expect(() => validateAiProviderConfig({
    provider: "deepseek",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-chat",
    enabled: false,
    extra: "nope",
  })).toThrow();
});
