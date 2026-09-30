"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SkillScopeRow } from "@/services/curriculum/skill-scope";

type Props = {
  rows: SkillScopeRow[];
  childId: string;
};

const modeLabels: Record<string, string> = {
  auto: "自动",
  on: "提前开启",
  off: "关闭",
};

const segmentGroupStyle: React.CSSProperties = {
  display: "inline-flex",
  gap: "0",
  border: "1px solid var(--sand)",
  borderRadius: "0.65rem",
  overflow: "hidden",
};

const segmentButtonStyle = (active: boolean): React.CSSProperties => ({
  minHeight: "36px",
  padding: "0.5rem 0.9rem",
  border: "0",
  borderLeft: "1px solid var(--sand)",
  background: active ? "var(--brand)" : "white",
  color: active ? "white" : "var(--muted)",
  cursor: "pointer",
  fontSize: "0.82rem",
  fontWeight: 700,
});

const restoreButtonStyle: React.CSSProperties = {
  minHeight: "36px",
  padding: "0.4rem 0.7rem",
  border: "1px solid var(--brand)",
  borderRadius: "0.5rem",
  background: "white",
  color: "var(--brand)",
  cursor: "pointer",
  fontSize: "0.78rem",
  fontWeight: 700,
};

const rowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto auto",
  gap: "1rem",
  alignItems: "center",
  padding: "1rem 1.15rem",
  border: "1px solid var(--sand)",
  borderRadius: "0.75rem",
  background: "white",
  marginBottom: "0.6rem",
};

const infoStyle: React.CSSProperties = {
  display: "grid",
  gap: "0.3rem",
  minWidth: "0",
};

const metaStyle: React.CSSProperties = {
  color: "#57635f",
  fontSize: "0.82rem",
};

const listStyle: React.CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: 0,
};

const errorStyle: React.CSSProperties = {
  color: "#9b2424",
  fontWeight: 700,
  marginBottom: "1rem",
};

export function ChildSkillSettings({ rows, childId }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleModeChange(skillId: string, mode: "auto" | "on" | "off") {
    setPending(skillId);
    setError(null);
    try {
      const response = await fetch(`/api/parent/children/${childId}/skills`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ skillId, mode }),
      });
      if (!response.ok) {
        setError("保存失败，请刷新后重试");
        return;
      }
      router.refresh();
    } catch {
      setError("网络连接失败，请检查网络后重试");
    } finally {
      setPending(null);
    }
  }

  return (
    <div>
      {error && <p style={errorStyle} role="alert">{error}</p>}
      <ul style={listStyle}>
        {rows.map((row) => (
          <li key={row.skillId} style={rowStyle}>
            <div style={infoStyle}>
              <strong>{row.name}</strong>
              <span style={metaStyle}>
                {row.grade}年级{row.semester === 1 ? "上" : "下"}·约第{row.expectedWeek}周
              </span>
              <span
                className="skillStatus"
                data-status={row.enabled ? "basic" : "needs_support"}
              >
                {row.enabled ? "已解锁" : "未解锁"}
              </span>
            </div>
            <div role="radiogroup" aria-label={`${row.name}开关模式`} style={segmentGroupStyle}>
              {(["auto", "on", "off"] as const).map((mode, idx) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={row.mode === mode}
                  disabled={pending === row.skillId}
                  onClick={() => handleModeChange(row.skillId, mode)}
                  style={{
                    ...segmentButtonStyle(row.mode === mode),
                    ...(idx === 0 ? { borderLeft: "0" } : {}),
                  }}
                >
                  {modeLabels[mode]}
                </button>
              ))}
            </div>
            {row.mode !== "auto" && (
              <button
                type="button"
                style={restoreButtonStyle}
                onClick={() => handleModeChange(row.skillId, "auto")}
                disabled={pending === row.skillId}
              >
                恢复自动
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
