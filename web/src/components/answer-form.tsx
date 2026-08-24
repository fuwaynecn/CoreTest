"use client";

import { FormEvent, useRef, useState, useSyncExternalStore } from "react";
import type { AttemptTelemetry } from "@/domain/training/attempt-telemetry";
import { DefiniteHintError, postHint, type HintResult } from "./request-hint";
import { ReadingCard, type ReadingCardResponse } from "./reading-card";
import { useActiveDuration } from "./use-active-duration";

export type AttemptResult = {
  correct: boolean;
  normalizedAnswer: string;
  explanation: string;
  sessionCompleted: boolean;
};

type AnswerFormProps = {
  sessionItemId: string;
  readingCard?: boolean;
  nextHref?: string;
  submitAnswer?: (payload: {
    sessionItemId: string;
    clientSubmissionId: string;
    answerText: string;
    activeDurationMs: number;
    hintLevel: AttemptTelemetry["hintLevel"];
    hintCount: number;
    readingCardResponse?: ReadingCardResponse;
  }) => Promise<AttemptResult>;
  requestHint?: (sessionItemId: string, requestId: string) => Promise<HintResult>;
  saveReflection?: (payload: {
    sessionItemId: string;
    reflection: ChildReflection;
  }) => Promise<void>;
};

type ChildReflection = "did_not_read" | "missed_condition_or_unit" | "calculation_slip" | "method_unknown";

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
  readingCardResponse?: ReadingCardResponse;
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

async function postReflection(payload: { sessionItemId: string; reflection: ChildReflection }): Promise<void> {
  const response = await fetch("/api/child/error-reflections", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error("Reflection request failed");
}

const subscribeToHydration = () => () => undefined;

export function AnswerForm({
  sessionItemId,
  readingCard = false,
  nextHref = "/child",
  submitAnswer = postAttempt,
  requestHint = postHint,
  saveReflection = postReflection,
}: AnswerFormProps) {
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const [answerText, setAnswerText] = useState("");
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<HintResult | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const hintRequestIdRef = useRef<string | null>(null);
  const [pendingTelemetry, setPendingTelemetry] = useState<AttemptTelemetry | null>(null);
  const [hadIncorrectAnswer, setHadIncorrectAnswer] = useState(false);
  const [reflectionComplete, setReflectionComplete] = useState(false);
  const [reflectionSaving, setReflectionSaving] = useState(false);
  const [readingCardResponse, setReadingCardResponse] = useState<ReadingCardResponse | null>(null);
  const currentActiveDuration = useActiveDuration();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readingCard && (!readingCardResponse || Object.values(readingCardResponse).some((value) => !value.trim()))) {
      setError("先完成审题卡，再提交答案。");
      return;
    }
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
        readingCardResponse: readingCardResponse ?? undefined,
        ...telemetry,
      });
      setResult(nextResult);
      if (nextResult.sessionCompleted) localStorage.removeItem(`math-scratch:${sessionItemId}`);
      if (!nextResult.correct) setHadIncorrectAnswer(true);
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
    const requestId = hintRequestIdRef.current ?? crypto.randomUUID();
    hintRequestIdRef.current = requestId;
    setHintLoading(true);
    setError(null);
    try {
      setHint(await requestHint(sessionItemId, requestId));
      hintRequestIdRef.current = null;
    } catch (caught) {
      if (caught instanceof DefiniteHintError) {
        hintRequestIdRef.current = null;
        setError(caught.message);
      } else {
        setError("提示暂时无法加载，请稍后重试。");
      }
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

  async function handleReflection(reflection: ChildReflection) {
    setReflectionSaving(true);
    setError(null);
    try {
      await saveReflection({ sessionItemId, reflection });
      setReflectionComplete(true);
    } catch {
      setError("原因暂时没有保存，请重试或选择暂时不选。");
    } finally {
      setReflectionSaving(false);
    }
  }

  return (
    <form className="answerForm" onSubmit={handleSubmit}>
      {readingCard && <ReadingCard onChange={setReadingCardResponse} />}
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
          {hadIncorrectAnswer && !reflectionComplete ? (
            <div className="errorReflection">
              <p>刚才主要卡在哪里？</p>
              {([
                ["did_not_read", "没看清问题"],
                ["missed_condition_or_unit", "漏了条件或单位"],
                ["calculation_slip", "会做但算错"],
                ["method_unknown", "方法不会"],
              ] as const).map(([value, label]) => (
                <button key={value} type="button" disabled={reflectionSaving} onClick={() => handleReflection(value)}>{label}</button>
              ))}
              <button type="button" disabled={reflectionSaving} onClick={() => setReflectionComplete(true)}>暂时不选</button>
            </div>
          ) : (
            <button type="button" onClick={goToNextQuestion}>下一题</button>
          )}
        </section>
      )}
    </form>
  );
}
