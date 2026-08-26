import { act, render, screen, waitFor } from "@testing-library/react";
import { enqueueSubmission, readSubmissionQueue } from "@/services/offline/offline-store";
import { OfflineStatus } from "./offline-status";

function setNavigatorOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value });
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  setNavigatorOnline(true);
});

test("shows offline and online status changes from window events", () => {
  setNavigatorOnline(true);
  render(<OfflineStatus />);

  expect(screen.getByText("当前在线，可直接提交。")).toBeInTheDocument();

  act(() => {
    setNavigatorOnline(false);
    window.dispatchEvent(new Event("offline"));
  });
  expect(screen.getByText("当前离线，提交会先暂存。")).toBeInTheDocument();

  act(() => {
    setNavigatorOnline(true);
    window.dispatchEvent(new Event("online"));
  });
  expect(screen.getByText("当前在线，可直接提交。")).toBeInTheDocument();
});

test("replays queued submissions in order and keeps unknown failures queued", async () => {
  enqueueSubmission({
    id: "first",
    endpoint: "/api/child/attempts",
    body: JSON.stringify({ sessionItemId: "item-1", answerText: "6" }),
    clientSubmissionId: "11111111-1111-4111-8111-111111111111",
    createdAt: 10,
  });
  enqueueSubmission({
    id: "second",
    endpoint: "/api/child/diagnosis",
    body: JSON.stringify({ sessionItemId: "item-2", answerText: "7" }),
    clientSubmissionId: "22222222-2222-4222-8222-222222222222",
    createdAt: 20,
  });
  enqueueSubmission({
    id: "third",
    endpoint: "/api/child/attempts",
    body: JSON.stringify({ sessionItemId: "item-3", answerText: "8" }),
    clientSubmissionId: "33333333-3333-4333-8333-333333333333",
    createdAt: 30,
  });
  const fetchSpy = vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: "bad request" }), { status: 400 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: "temporary" }), { status: 503 }));

  render(<OfflineStatus />);

  act(() => {
    window.dispatchEvent(new Event("online"));
  });

  expect(await screen.findByText("正在同步暂存提交...")).toBeInTheDocument();
  await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(3));
  expect(fetchSpy.mock.calls.map(([url]) => url)).toEqual([
    "/api/child/attempts",
    "/api/child/diagnosis",
    "/api/child/attempts",
  ]);
  expect(readSubmissionQueue()).toEqual([
    expect.objectContaining({ id: "third" }),
  ]);
  expect(screen.getByText("有 1 条提交仍未同步，请联网后重试。")).toBeInTheDocument();
});
