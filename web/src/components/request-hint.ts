export type HintResult = {
  level: 1 | 2 | 3;
  hint: string;
  hintCount: number;
};

export class DefiniteHintError extends Error {
  definite = true as const;
}

function isHintResult(data: unknown): data is HintResult {
  return typeof data === "object" && data !== null
    && "level" in data && (data.level === 1 || data.level === 2 || data.level === 3)
    && "hint" in data && typeof data.hint === "string"
    && "hintCount" in data && typeof data.hintCount === "number";
}

export async function postHint(sessionItemId: string, requestId: string): Promise<HintResult> {
  const response = await fetch("/api/child/hints", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionItemId, requestId }),
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if ([400, 401, 403, 404].includes(response.status)) {
      const message = typeof data === "object" && data !== null
        && "error" in data && typeof data.error === "string"
        ? data.error
        : "提示请求无效";
      throw new DefiniteHintError(message);
    }
    throw new Error("Uncertain hint server response");
  }
  if (!isHintResult(data)) throw new Error("Uncertain hint response");
  return data;
}
