"use client";

import { FormEvent, useState, useSyncExternalStore } from "react";

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
};

type DiagnosisAnswerFormProps = {
  sessionItemId: string;
  runId: string;
  submitAnswer?: (submission: Submission) => Promise<DiagnosisAttemptResult>;
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
    if ([400, 401, 403].includes(response.status)) throw new CertainSubmissionError(message);
    throw new Error("Uncertain diagnosis server response");
  }
  if (!isDiagnosisAttemptResult(data)) throw new Error("Uncertain diagnosis response");
  return data;
}

const subscribeToHydration = () => () => undefined;

export function DiagnosisAnswerForm({
  sessionItemId,
  runId,
  submitAnswer = postDiagnosisAnswer,
  navigate = (href) => window.location.assign(href),
}: DiagnosisAnswerFormProps) {
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const [answerText, setAnswerText] = useState("");
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<DiagnosisAttemptResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || result) return;
    const clientSubmissionId = submissionId ?? crypto.randomUUID();
    setSubmissionId(clientSubmissionId);
    setSubmitting(true);
    setError(null);
    try {
      const next = await submitAnswer({ sessionItemId, clientSubmissionId, answerText });
      setResult(next);
      setSubmissionId(null);
    } catch (caught) {
      if (typeof caught === "object" && caught !== null && "certain" in caught && caught.certain === true) {
        setSubmissionId(null);
        setError(caught instanceof Error ? caught.message : "答案需要修改后再提交。");
      } else {
        setError("提交状态还不能确认，请重试。");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const uncertain = submissionId !== null && !submitting && result === null && error !== null;
  const locked = !hydrated || submitting || uncertain || result !== null;
  const nextHref = `/child/diagnosis/${result?.diagnosis.runId ?? runId}`;

  return (
    <form className="answerForm diagnosisAnswerForm" onSubmit={handleSubmit}>
      <label className="answerLabel" htmlFor={`answer-${sessionItemId}`}>你的答案</label>
      <input
        id={`answer-${sessionItemId}`}
        value={answerText}
        onChange={(event) => setAnswerText(event.target.value)}
        disabled={locked}
        autoComplete="off"
      />
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
