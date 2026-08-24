"use client";

import { useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

export type TrainingSegment = "warmup" | "core" | "reading" | "correction";

const segments: Array<{ id: TrainingSegment; label: string }> = [
  { id: "warmup", label: "旧知识唤醒" },
  { id: "core", label: "核心练习" },
  { id: "reading", label: "审题专项" },
  { id: "correction", label: "订正回看" },
];

export function TrainingSegments({ current, composition }: { current: TrainingSegment; composition: Record<TrainingSegment, number> }) {
  return <nav className="trainingSegments" aria-label="今天的训练进度">{segments.map((segment) => (
    <span key={segment.id} aria-current={segment.id === current ? "step" : "false"}>
      {segment.label}<small>{composition[segment.id]}</small>
    </span>
  ))}</nav>;
}

export function StopSessionButton({ sessionId, sessionItemIds, targetAt }: { sessionId: string; sessionItemIds: string[]; targetAt?: number }) {
  const router = useRouter();
  const reachedTarget = useSyncExternalStore(
    (notify) => { const timer = window.setInterval(notify, 1_000); return () => window.clearInterval(timer); },
    () => targetAt !== undefined && Date.now() >= targetAt,
    () => false,
  );
  async function stop() {
    const response = await fetch(`/api/child/sessions/${sessionId}/stop`, { method: "POST" });
    if (!response.ok) return;
    for (const itemId of sessionItemIds) localStorage.removeItem(`math-scratch:${itemId}`);
    router.push("/child");
  }
  return <div>{reachedTarget && <p className="targetTimePrompt">今天的目标时间到了，可以先到这里。</p>}<button className="stopSession" type="button" onClick={stop}>{reachedTarget ? "今天先到这里" : "结束今天训练"}</button></div>;
}
