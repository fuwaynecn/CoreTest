"use client";

import { useRef, useState } from "react";

type ParentRetestButtonProps = {
  childId: string;
  expectedCompletedVersion: number;
  refresh?: () => void;
};

function responseMessage(value: unknown): string {
  if (typeof value === "object" && value !== null && "error" in value) {
    const error = value.error;
    if (typeof error === "object" && error !== null && "message" in error
      && typeof error.message === "string") return error.message;
  }
  return "暂时无法发起重新诊断，请稍后再试";
}

export function ParentRetestButton({
  childId,
  expectedCompletedVersion,
  refresh = () => window.location.reload(),
}: ParentRetestButtonProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function startRetest() {
    if (inFlight.current) return;
    inFlight.current = true;
    let completed = false;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/parent/diagnosis/retest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedCompletedVersion, childId }),
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setError(responseMessage(data));
        return;
      }
      completed = true;
      refresh();
    } catch {
      setError("网络状态不确定，请刷新页面确认后再操作");
    } finally {
      if (!completed) {
        inFlight.current = false;
        setSubmitting(false);
      }
    }
  }

  return (
    <div className="parentRetestAction">
      <button type="button" onClick={startRetest} disabled={submitting}>
        {submitting ? "正在发起" : `发起第 ${expectedCompletedVersion + 1} 版诊断`}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
