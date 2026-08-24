"use client";

export function Scratchpad({ sessionItemId }: { sessionItemId: string }) {
  const key = `math-scratch:${sessionItemId}`;
  return <label className="scratchpad">草稿<textarea defaultValue={typeof window === "undefined" ? "" : localStorage.getItem(key) ?? ""} onChange={(event) => localStorage.setItem(key, event.target.value)} /></label>;
}
