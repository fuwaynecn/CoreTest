"use client";

import { useEffect, useRef } from "react";

export function useActiveDuration() {
  const activeDurationRef = useRef(0);
  const activeSinceRef = useRef<number | null>(null);

  useEffect(() => {
    function syncActiveTime() {
      const now = Date.now();
      const active = document.visibilityState === "visible" && document.hasFocus();
      if (active && activeSinceRef.current === null) activeSinceRef.current = now;
      if (!active && activeSinceRef.current !== null) {
        activeDurationRef.current += now - activeSinceRef.current;
        activeSinceRef.current = null;
      }
    }

    syncActiveTime();
    document.addEventListener("visibilitychange", syncActiveTime);
    window.addEventListener("focus", syncActiveTime);
    window.addEventListener("blur", syncActiveTime);
    return () => {
      if (activeSinceRef.current !== null) {
        activeDurationRef.current += Date.now() - activeSinceRef.current;
        activeSinceRef.current = null;
      }
      document.removeEventListener("visibilitychange", syncActiveTime);
      window.removeEventListener("focus", syncActiveTime);
      window.removeEventListener("blur", syncActiveTime);
    };
  }, []);

  return function currentActiveDuration(): number {
    const running = activeSinceRef.current === null ? 0 : Date.now() - activeSinceRef.current;
    return Math.max(0, Math.trunc(activeDurationRef.current + running));
  };
}
