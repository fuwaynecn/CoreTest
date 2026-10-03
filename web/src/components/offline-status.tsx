"use client";

import { useEffect, useState } from "react";
import { readSubmissionQueue, removeSubmission } from "@/services/offline/offline-store";

type SyncState =
  | { kind: "online" }
  | { kind: "offline" }
  | { kind: "syncing" }
  | { kind: "failed"; remaining: number };

function getOnlineStatus() {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

async function flushQueuedSubmissions() {
  for (const item of readSubmissionQueue()) {
    try {
      const response = await fetch(item.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: item.body,
      });
      if (response.ok || [400, 401, 403, 404].includes(response.status)) {
        removeSubmission(item.id);
      }
      } catch {
        break;
      }
  }
  return readSubmissionQueue().length;
}

export function OfflineStatus() {
  // The server cannot read navigator.onLine, so the first render must not depend on it or hydration
  // would mismatch on every page; the effect below corrects this as soon as the component mounts.
  const [syncState, setSyncState] = useState<SyncState>({ kind: "offline" });

  useEffect(() => {
    let active = true;
    let syncing = false;

    async function syncQueue() {
      if (syncing) return;
      if (!getOnlineStatus() || readSubmissionQueue().length === 0) {
        if (active) setSyncState(getOnlineStatus() ? { kind: "online" } : { kind: "offline" });
        return;
      }
      syncing = true;
      setSyncState({ kind: "syncing" });
      const remaining = await flushQueuedSubmissions();
      syncing = false;
      if (!active) return;
      setSyncState(remaining > 0 ? { kind: "failed", remaining } : { kind: "online" });
    }

    function handleOnline() {
      void syncQueue();
    }

    function handleOffline() {
      setSyncState({ kind: "offline" });
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    void syncQueue();

    return () => {
      active = false;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const message = syncState.kind === "offline"
    ? "当前离线，提交会先暂存。"
    : syncState.kind === "syncing"
      ? "正在同步暂存提交..."
      : syncState.kind === "failed"
        ? `有 ${syncState.remaining} 条提交仍未同步，请联网后重试。`
        : "当前在线，可直接提交。";

  return <p className="offlineStatus" aria-live="polite">{message}</p>;
}
