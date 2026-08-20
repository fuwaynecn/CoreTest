"use client";

import { useRef, useState } from "react";
import type { ErrorCause } from "@/domain/learning/contracts";
import type { ErrorEvidenceView, ErrorSummaryView } from "@/services/parent/get-learning-state";

const causeLabels: Record<ErrorCause, string> = {
  missing_unit: "漏单位或单位不符",
  copied_number: "抄错已知数",
  calculation: "会做但计算有误",
  relationship: "数量关系或方法不清楚",
  range_check: "估算检查未发现异常",
  incomplete_reading: "没有完整读清题目",
  unknown: "暂时无法判断",
};

const reflectionLabels = {
  did_not_read: "没看清问题",
  missed_condition_or_unit: "漏了条件或单位",
  calculation_slip: "会做但算错",
  method_unknown: "方法不会",
} as const;

const sourceLabels = { system: "系统候选", child: "孩子自评", parent: "家长修正" } as const;

function durationLabel(value: number | null) {
  if (value === null) return "活跃作答用时未记录（仅作上下文）";
  if (value < 60_000) return `活跃作答约 ${Math.round(value / 1_000)} 秒（仅作上下文）`;
  return `活跃作答约 ${Math.round(value / 60_000)} 分钟（仅作上下文）`;
}

function auditValue(value: ErrorEvidenceView["history"][number]["value"]) {
  return value in reflectionLabels
    ? reflectionLabels[value as keyof typeof reflectionLabels]
    : causeLabels[value as ErrorCause];
}

function responseMessage(value: unknown) {
  if (typeof value === "object" && value !== null && "error" in value) {
    const error = value.error;
    if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") return error.message;
  }
  return "错因修正没有保存，请稍后再试";
}

function ErrorCorrection({ error, refresh }: { error: ErrorEvidenceView; refresh: () => void }) {
  const [cause, setCause] = useState<ErrorCause>(error.effectiveCause);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const inFlight = useRef(false);

  async function saveCorrection() {
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setMessage(null);
    setSaved(false);
    try {
      const response = await fetch(`/api/parent/error-observations/${error.rootObservationId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cause }),
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(responseMessage(data));
        return;
      }
      setSaved(true);
      setMessage("已保存，正在更新证据链");
      refresh();
    } catch {
      setMessage("网络状态不确定，请刷新页面确认后再操作");
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className="errorCorrection">
      <label>
        修正当前错因
        <select value={cause} onChange={(event) => setCause(event.target.value as ErrorCause)} disabled={submitting}>
          {Object.entries(causeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <button type="button" onClick={saveCorrection} disabled={submitting}>{submitting ? "正在保存" : "保存家长修正"}</button>
      {message && <p role={saved ? "status" : "alert"}>{message}</p>}
    </div>
  );
}

export function ErrorSummary({
  summary,
  errors,
  refresh = () => window.location.reload(),
}: {
  summary: ErrorSummaryView;
  errors: ErrorEvidenceView[];
  refresh?: () => void;
}) {
  const categories = [
    ["knowledge", "知识性失误", summary.knowledge],
    ["habit", "习惯性失误", summary.habit],
    ["unknown", "暂无法判断", summary.unknown],
  ] as const;
  return (
    <section className="learningStateSection errorSection" aria-labelledby="error-heading">
      <div className="sectionHeading">
        <div>
          <p className="eyebrow">错因证据</p>
          <h2 id="error-heading">先分清是方法，还是检查习惯</h2>
        </div>
        <p>当前错因优先使用家长修正，其次孩子自评，最后才是系统候选。</p>
      </div>
      <dl className="errorTotals">
        {categories.map(([category, label, count]) => {
          const first = errors.find((error) => error.effectiveCategory === category);
          return (
            <div key={category} data-category={category}>
              <dt>{label}</dt><dd>{count}</dd>
              {first && <a href={`#error-evidence-${first.rootObservationId}`}>查看{label}证据</a>}
            </div>
          );
        })}
      </dl>
      {errors.length === 0 ? <p className="emptyEvidence">当前没有需要归因的首答错误。</p> : (
        <div className="errorEvidenceList">
          {errors.map((error) => (
            <article id={`error-evidence-${error.rootObservationId}`} key={error.rootObservationId} tabIndex={-1} aria-label={`${error.skillName}题的错因证据`}>
              <header>
                <div><span>{error.skillName} · {error.occurredOn}</span><h3>{causeLabels[error.effectiveCause]}</h3></div>
                <b data-category={error.effectiveCategory}>{error.effectiveCategory === "knowledge" ? "知识性" : error.effectiveCategory === "habit" ? "习惯性" : "待判断"}</b>
              </header>
              <blockquote>{error.stem}</blockquote>
              <div className="answerTrail">
                <p><span>首次答案</span><strong>{error.firstAnswer ?? "未记录"}</strong></p>
                <p><span>订正答案</span><strong>{error.correctedAnswer ?? "尚未完成正确订正"}</strong></p>
                <p><span>当前依据</span><strong>{sourceLabels[error.effectiveSource]}</strong></p>
              </div>
              <p className="durationContext">{durationLabel(error.activeDurationMs)}</p>
              <details>
                <summary>查看完整错因审计</summary>
                <ol className="auditTrail">
                  {error.history.map((entry) => (
                    <li key={entry.id}>
                      <strong>{sourceLabels[entry.source]}：{auditValue(entry.value)}</strong>
                      <span>{entry.actorName ? `${entry.actorName} · ` : ""}{new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(entry.observedAt)}</span>
                    </li>
                  ))}
                </ol>
              </details>
              <ErrorCorrection error={error} refresh={refresh} />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
