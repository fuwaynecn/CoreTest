"use client";

import { FormEvent, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { AttemptTelemetry } from "@/domain/training/attempt-telemetry";

export type AttemptResult = {
  correct: boolean;
  normalizedAnswer: string;
  explanation: string;
  sessionCompleted: boolean;
};

type AnswerFormProps = {
  sessionItemId: string;
  nextHref?: string;
  submitAnswer?: (payload: {
    sessionItemId: string;
    clientSubmissionId: string;
    answerText: string;
    activeDurationMs: number;
    hintLevel: AttemptTelemetry["hintLevel"];
    hintCount: number;
  }) => Promise<AttemptResult>;
  requestHint?: (sessionItemId: string) => Promise<HintResult>;
};

type HintResult = {
  level: 1 | 2 | 3;
  hint: string;
  hintCount: number;
};

class AttemptResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttemptResponseError";
  }
}

function isAttemptResult(data: unknown): data is AttemptResult {
  return typeof data === "object"
    && data !== null
    && "correct" in data
    && typeof data.correct === "boolean"
    && "normalizedAnswer" in data
    && typeof data.normalizedAnswer === "string"
    && "explanation" in data
    && typeof data.explanation === "string"
    && "sessionCompleted" in data
    && typeof data.sessionCompleted === "boolean";
}

async function postAttempt(payload: {
  sessionItemId: string;
  clientSubmissionId: string;
  answerText: string;
  activeDurationMs: number;
  hintLevel: AttemptTelemetry["hintLevel"];
  hintCount: number;
}): Promise<AttemptResult> {
  const response = await fetch("/api/child/attempts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message = typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
      ? data.error
      : "提交没有成功，请修改答案后重试。";
    if ([400, 401, 403, 404].includes(response.status)) {
      throw new AttemptResponseError(message);
    }
    throw new Error("Uncertain attempt server response");
  }
  if (!isAttemptResult(data)) throw new Error("Unexpected attempt response");
  return data;
}

function isHintResult(data: unknown): data is HintResult {
  return typeof data === "object" && data !== null
    && "level" in data && (data.level === 1 || data.level === 2 || data.level === 3)
    && "hint" in data && typeof data.hint === "string"
    && "hintCount" in data && typeof data.hintCount === "number";
}

async function postHint(sessionItemId: string): Promise<HintResult> {
  const response = await fetch("/api/child/hints", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionItemId }),
  });
  const data: unknown = await response.json();
  if (!response.ok || !isHintResult(data)) throw new Error("Hint request failed");
  return data;
}

const subscribeToHydration = () => () => undefined;

export function AnswerForm({
  sessionItemId,
  nextHref = "/child",
  submitAnswer = postAttempt,
  requestHint = postHint,
}: AnswerFormProps) {
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const [answerText, setAnswerText] = useState("");
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<HintResult | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [pendingTelemetry, setPendingTelemetry] = useState<AttemptTelemetry | null>(null);
  const activeDurationRef = useRef(0);
  const activeSinceRef = useRef<number | null>(null);

  useEffect(() => {
    function syncActiveTime() {
      const now = Date.now();
      const active = document.visibilityState === "visible" && document.hasFocus();
      if (active && activeSinceRef.current === null) activeSinceRef.current = now;
      if (!active && activeSinceRef.current !== null) {
        activeDurationRef.current += now - activeSinceRef.current;
        activeSinceRef.current = null;
      }
    }

    syncActiveTime();
    document.addEventListener("visibilitychange", syncActiveTime);
    window.addEventListener("focus", syncActiveTime);
    window.addEventListener("blur", syncActiveTime);
    return () => {
      if (activeSinceRef.current !== null) {
        activeDurationRef.current += Date.now() - activeSinceRef.current;
        activeSinceRef.current = null;
      }
      document.removeEventListener("visibilitychange", syncActiveTime);
      window.removeEventListener("focus", syncActiveTime);
      window.removeEventListener("blur", syncActiveTime);
    };
  }, []);

  function currentActiveDuration(): number {
    const running = activeSinceRef.current === null ? 0 : Date.now() - activeSinceRef.current;
    return Math.max(0, Math.trunc(activeDurationRef.current + running));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clientSubmissionId = submissionId ?? crypto.randomUUID();
    const telemetry = pendingTelemetry ?? {
      activeDurationMs: currentActiveDuration(),
      hintLevel: hint?.level ?? 0,
      hintCount: hint?.hintCount ?? 0,
    };

    setSubmissionId(clientSubmissionId);
    setPendingTelemetry(telemetry);
    setSubmitting(true);
    setError(null);
    try {
      const nextResult = await submitAnswer({
        sessionItemId,
        clientSubmissionId,
        answerText,
        ...telemetry,
      });
      setResult(nextResult);
      setSubmissionId(null);
      setPendingTelemetry(null);
    } catch (error) {
      if (error instanceof AttemptResponseError) {
        setSubmissionId(null);
        setPendingTelemetry(null);
        setError(error.message);
      } else {
        setError("提交没有成功，请重试。");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const answerLocked = !hydrated || submitting || submissionId !== null || result !== null;

  async function handleHint() {
    setHintLoading(true);
    setError(null);
    try {
      setHint(await requestHint(sessionItemId));
    } catch {
      setError("提示暂时无法加载，请稍后重试。");
    } finally {
      setHintLoading(false);
    }
  }

  function goToNextQuestion() {
    const nextUrl = new URL(nextHref, window.location.href);
    if (nextUrl.href === window.location.href) {
      window.location.reload();
      return;
    }
    window.location.assign(nextUrl.href);
  }

  return (
    <form className="answerForm" onSubmit={handleSubmit}>
      <label className="answerLabel" htmlFor={`answer-${sessionItemId}`}>你的答案</label>
      <input
        id={`answer-${sessionItemId}`}
        value={answerText}
        onChange={(event) => setAnswerText(event.target.value)}
        disabled={answerLocked}
      />
      <button type="button" onClick={handleHint} disabled={answerLocked || hintLoading}>
        {hintLoading ? "正在加载提示" : "查看提示"}
      </button>
      {hint && (
        <p className="answerHint" aria-live="polite">
          <strong>提示 {hint.level}：</strong><span>{hint.hint}</span>
        </p>
      )}
      <button type="submit" disabled={!hydrated || submitting || result !== null}>{submitting ? "正在提交" : submissionId ? "重试提交" : "提交答案"}</button>
      {error && <p className="answerError" role="alert">{error}</p>}
      {result && !result.correct && (
        <section className="answerFeedback answerFeedbackIncorrect" aria-live="polite">
          <h2><span aria-hidden="true">↻</span> 再看一步</h2>
          <p>{result.explanation}</p>
          <button type="button" onClick={() => setResult(null)}>修改答案</button>
        </section>
      )}
      {result?.correct && (
        <section className="answerFeedback answerFeedbackCorrect" aria-live="polite">
          <p><span aria-hidden="true">✓</span> 做对了，别忘了检查题目问的是什么。</p>
          <button type="button" onClick={goToNextQuestion}>下一题</button>
        </section>
      )}
    </form>
  );
}
