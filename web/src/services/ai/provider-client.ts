export type AiChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AiProviderErrorCode = "timeout" | "network" | "http" | "invalid_response";

export class AiProviderError extends Error {
  code: AiProviderErrorCode;

  constructor(code: AiProviderErrorCode, message?: string) {
    super(message ?? code);
    this.name = "AiProviderError";
    this.code = code;
  }
}

type CallAiProviderInput = {
  baseUrl: string;
  model: string;
  apiKey: string;
  messages: AiChatMessage[];
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

const DEFAULT_TIMEOUT_MS = 15_000;

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function toInvalidResponse() {
  return new AiProviderError("invalid_response", "AI provider returned an invalid response");
}

export async function callAiProvider(input: CallAiProviderInput): Promise<{ text: string }> {
  const controller = new AbortController();
  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let response: Response;

    try {
      response = await fetchImpl(`${normalizeBaseUrl(input.baseUrl)}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${input.apiKey}`,
        },
        body: JSON.stringify({
          model: input.model,
          messages: input.messages,
          temperature: 0.2,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (isAbortError(error)) {
        throw new AiProviderError("timeout", "AI provider request timed out");
      }

      throw new AiProviderError("network", "AI provider request failed");
    }

    if (!response.ok) {
      throw new AiProviderError("http", `AI provider returned HTTP ${response.status}`);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw toInvalidResponse();
    }

    const text = extractMessageText(payload);

    if (!text) {
      throw toInvalidResponse();
    }

    return { text };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function extractMessageText(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("choices" in payload)) {
    return null;
  }

  const { choices } = payload as { choices?: unknown };
  if (!Array.isArray(choices) || choices.length === 0) {
    return null;
  }

  const content = choices[0];
  if (!content || typeof content !== "object" || !("message" in content)) {
    return null;
  }

  const { message } = content as { message?: unknown };
  if (!message || typeof message !== "object" || !("content" in message)) {
    return null;
  }

  const value = (message as { content?: unknown }).content;
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
