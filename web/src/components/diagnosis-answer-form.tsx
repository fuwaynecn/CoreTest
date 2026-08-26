"use client";

import { FormEvent, startTransition, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { AttemptTelemetry } from "@/domain/training/attempt-telemetry";
import { clearDraft, enqueueSubmission, readDraft, writeDraft } from "@/services/offline/offline-store";
import { DefiniteHintError, postHint, type HintResult } from "./request-hint";
import { useActiveDuration } from "./use-active-duration";

type DiagnosisAttemptResult = {
  correct: boolean;
  normalizedAnswer: string;
  explanation: string;
  diagnosis: {
    runId: string;
    status: "in_progress" | "completed";
    completedSlots: number;
  };
};

type Submission = {
  sessionItemId: string;
  clientSubmissionId: string;
  answerText: string;
  activeDurationMs: number;
  hintLevel: AttemptTelemetry["hintLevel"];
  hintCount: number;
};

type DiagnosisAnswerFormProps = {
  sessionItemId: string;
  runId: string;
  answerMode?: "mental" | "written" | "choice" | "fill" | "expression" | "equation";
  answerKind?: "number" | "choice";
  requiresUnit?: boolean;
  choiceOptions?: readonly { label: "A" | "B" | "C" | "D"; text: string }[];
  submitAnswer?: (submission: Submission) => Promise<DiagnosisAttemptResult>;
  requestHint?: (sessionItemId: string, requestId: string) => Promise<HintResult>;
  navigate?: (href: string) => void;
};

class CertainSubmissionError extends Error {
  certain = true as const;
}

function isDiagnosisAttemptResult(value: unknown): value is DiagnosisAttemptResult {
  if (typeof value !== "object" || value === null) return false;
  const result = value as Partial<DiagnosisAttemptResult>;
  return typeof result.correct === "boolean"
    && typeof result.normalizedAnswer === "string"
    && typeof result.explanation === "string"
    && typeof result.diagnosis === "object"
    && result.diagnosis !== null
    && typeof result.diagnosis.runId === "string"
    && (result.diagnosis.status === "in_progress" || result.diagnosis.status === "completed")
    && typeof result.diagnosis.completedSlots === "number";
}

async function postDiagnosisAnswer(submission: Submission): Promise<DiagnosisAttemptResult> {
  const response = await fetch("/api/child/diagnosis", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(submission),
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
      ? data.error
      : "答案需要修改后再提交。";
    if ([400, 401, 403, 404].includes(response.status)) throw new CertainSubmissionError(message);
    throw new Error("Uncertain diagnosis server response");
  }
  if (!isDiagnosisAttemptResult(data)) throw new Error("Uncertain diagnosis response");
  return data;
}

const subscribeToHydration = () => () => undefined;

export function DiagnosisAnswerForm({
  sessionItemId,
  runId,
  answerMode = "written",
  answerKind = "number",
  requiresUnit = false,
  choiceOptions = [],
  submitAnswer = postDiagnosisAnswer,
  requestHint = postHint,
  navigate = (href) => window.location.assign(href),
}: DiagnosisAnswerFormProps) {
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const [answerText, setAnswerText] = useState("");
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<DiagnosisAttemptResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<HintResult | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [pendingTelemetry, setPendingTelemetry] = useState<AttemptTelemetry | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const hintRequestIdRef = useRef<string | null>(null);
  const currentActiveDuration = useActiveDuration();

  useEffect(() => {
    if (!hydrated) return;
    startTransition(() => {
      setAnswerText(readDraft(sessionItemId)?.answerText ?? "");
      setDraftReady(true);
    });
  }, [hydrated, sessionItemId]);

  useEffect(() => {
    if (!hydrated || !draftReady) return;
    if (!answerText.trim()) return;
    writeDraft({
      sessionItemId,
      answerText,
      updatedAt: Date.now(),
    });
  }, [answerText, draftReady, hydrated, sessionItemId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || result) return;
    if (answerText.trim().length === 0) {
      setError("请输入答案");
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
      const next = await submitAnswer({ sessionItemId, clientSubmissionId, answerText, ...telemetry });
      setResult(next);
      clearDraft(sessionItemId);
      setSubmissionId(null);
      setPendingTelemetry(null);
    } catch (caught) {
      if (typeof caught === "object" && caught !== null && "certain" in caught && caught.certain === true) {
        setSubmissionId(null);
        setPendingTelemetry(null);
        setError(caught instanceof Error ? caught.message : "答案需要修改后再提交。");
      } else {
        enqueueSubmission({
          id: clientSubmissionId,
          endpoint: "/api/child/diagnosis",
          body: JSON.stringify({ sessionItemId, clientSubmissionId, answerText, ...telemetry }),
          clientSubmissionId,
          createdAt: Date.now(),
        });
        setSubmissionId(null);
        setPendingTelemetry(null);
        setError("已暂存，网络恢复后会自动提交。");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const uncertain = false;
  const locked = !hydrated || submitting || result !== null;
  const nextHref = `/child/diagnosis/${result?.diagnosis.runId ?? runId}`;

  function updateAnswerText(value: string) {
    setAnswerText(value);
    if (value.trim()) writeDraft({ sessionItemId, answerText: value, updatedAt: Date.now() });
    else clearDraft(sessionItemId);
  }

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

  return (
    <form className="answerForm diagnosisAnswerForm" onSubmit={handleSubmit}>
      {answerMode === "choice" || answerKind === "choice" ? (
        <fieldset className="diagnosisChoices" disabled={locked}>
          <legend className="answerLabel">你的答案</legend>
          <div>
            {choiceOptions.map((option) => (
              <button
                key={option.label}
                type="button"
                aria-pressed={answerText === option.label}
                onClick={() => {
                  setAnswerText(option.label);
                  setError(null);
                }}
              >
                <strong>{option.label}.</strong> {option.text}
              </button>
            ))}
          </div>
        </fieldset>
      ) : (
        <>
          <label className="answerLabel" htmlFor={`answer-${sessionItemId}`}>你的答案</label>
          <input
            id={`answer-${sessionItemId}`}
            value={answerText}
            onChange={(event) => updateAnswerText(event.target.value)}
            disabled={locked}
            autoComplete="off"
            inputMode={answerKind === "number" && !requiresUnit ? "decimal" : "text"}
            maxLength={128}
          />
        </>
      )}
      <button type="button" onClick={handleHint} disabled={locked || hintLoading}>
        {hintLoading ? "正在加载提示" : "查看提示"}
      </button>
      {hint && (
        <p className="answerHint" aria-live="polite">
          <strong>提示 {hint.level}：</strong><span>{hint.hint}</span>
        </p>
      )}
      <button type="submit" disabled={!hydrated || submitting || result !== null}>
        {submitting ? "正在提交" : uncertain ? "重试提交" : "提交答案"}
      </button>
      {error && <p className="answerError" role="alert">{error}</p>}
      {result && (
        <section className="answerFeedback diagnosisRecorded" aria-live="polite">
          <h2>这题已记录</h2>
          <p>{result.correct ? "作答正确。" : "先继续完成诊断，结束后一起看需要加强的地方。"}</p>
          <button type="button" onClick={() => navigate(nextHref)}>
            {result.diagnosis.status === "completed" ? "查看完成" : "下一题"}
          </button>
        </section>
      )}
    </form>
  );
}
