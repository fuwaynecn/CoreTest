"use client";

import { FormEvent, useState, useSyncExternalStore } from "react";

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
  }) => Promise<AttemptResult>;
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
    throw new AttemptResponseError(message);
  }
  if (!isAttemptResult(data)) throw new Error("Unexpected attempt response");
  return data;
}

const subscribeToHydration = () => () => undefined;

export function AnswerForm({ sessionItemId, nextHref = "/child", submitAnswer = postAttempt }: AnswerFormProps) {
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const [answerText, setAnswerText] = useState("");
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clientSubmissionId = submissionId ?? crypto.randomUUID();

    setSubmissionId(clientSubmissionId);
    setSubmitting(true);
    setError(null);
    try {
      const nextResult = await submitAnswer({ sessionItemId, clientSubmissionId, answerText });
      setResult(nextResult);
      setSubmissionId(null);
    } catch (error) {
      if (error instanceof AttemptResponseError) {
        setSubmissionId(null);
        setError(error.message);
      } else {
        setError("提交没有成功，请重试。");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const answerLocked = !hydrated || submitting || submissionId !== null || result !== null;

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
