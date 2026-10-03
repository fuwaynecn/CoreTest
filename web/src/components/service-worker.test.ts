import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, test, vi } from "vitest";

type Listener = (event: Record<string, unknown>) => void;

function loadServiceWorker(cacheNames: string[] = []) {
  const listeners = new Map<string, Listener>();
  const deleteCache = vi.fn(async () => true);
  const context = {
    URL,
    caches: {
      delete: deleteCache,
      keys: async () => cacheNames,
      match: vi.fn(async () => undefined),
      open: async () => ({ addAll: async () => undefined, put: async () => undefined }),
    },
    fetch: vi.fn(async () => ({ ok: false, type: "basic", clone: () => ({}) })),
    self: {
      location: { origin: "https://math.fubee.cn" },
      clients: { claim: async () => undefined },
      skipWaiting: vi.fn(),
      addEventListener: (name: string, listener: Listener) => listeners.set(name, listener),
    },
  };

  const source = readFileSync(resolve(process.cwd(), "public/sw.js"), "utf8");
  runInNewContext(source, context);
  return { deleteCache, listeners };
}

describe("service worker", () => {
  test("does not intercept dynamic page navigation", () => {
    const { listeners } = loadServiceWorker();
    const respondWith = vi.fn();

    listeners.get("fetch")?.({
      request: new Request("https://math.fubee.cn/"),
      respondWith,
    });

    expect(respondWith).not.toHaveBeenCalled();
  });

  test("removes an obsolete shell cache during activation", async () => {
    const { deleteCache, listeners } = loadServiceWorker([
      "math-trainer-shell-v1",
      "math-trainer-shell-v2",
      "unrelated-cache",
    ]);
    const pending: Promise<unknown>[] = [];

    listeners.get("activate")?.({
      waitUntil: (promise: Promise<unknown>) => pending.push(promise),
    });
    await Promise.all(pending);

    expect(deleteCache).toHaveBeenCalledTimes(1);
    expect(deleteCache).toHaveBeenCalledWith("math-trainer-shell-v1");
  });
});
