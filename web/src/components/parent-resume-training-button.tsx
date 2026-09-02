"use client";

import { useRef, useState } from "react";

type ParentResumeTrainingButtonProps = {
  sessionId: string;
  refresh?: () => void;
};

export function ParentResumeTrainingButton({
  sessionId,
  refresh = () => window.location.reload(),
}: ParentResumeTrainingButtonProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function resume() {
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/parent/sessions/${sessionId}/resume`, { method: "POST" });
      if (!response.ok) {
        setError("今天没有可以恢复的未完成训练");
        return;
      }
      refresh();
    } catch {
      setError("网络状态不确定，请刷新页面确认后再操作");
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className="parentRetestAction">
      <button type="button" onClick={resume} disabled={submitting}>
        {submitting ? "正在恢复" : "恢复当前训练"}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
