import {
  clearDraft,
  enqueueSubmission,
  readDraft,
  readSubmissionQueue,
  removeSubmission,
  writeDraft,
} from "./offline-store";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

test("isolates drafts by session item id", () => {
  writeDraft({ sessionItemId: "item-1", answerText: "12", updatedAt: 10 });
  writeDraft({
    sessionItemId: "item-2",
    readingCardResponse: { target: "24" },
    updatedAt: 20,
  });

  expect(readDraft("item-1")).toEqual({
    sessionItemId: "item-1",
    answerText: "12",
    updatedAt: 10,
  });
  expect(readDraft("item-2")).toEqual({
    sessionItemId: "item-2",
    readingCardResponse: { target: "24" },
    updatedAt: 20,
  });

  clearDraft("item-1");

  expect(readDraft("item-1")).toBeNull();
  expect(readDraft("item-2")).toEqual({
    sessionItemId: "item-2",
    readingCardResponse: { target: "24" },
    updatedAt: 20,
  });
});

test("returns null or an empty queue for invalid JSON", () => {
  localStorage.setItem("math-offline:draft:item-1", "{");
  localStorage.setItem("math-offline:submission-queue", "{");

  expect(readDraft("item-1")).toBeNull();
  expect(readSubmissionQueue()).toEqual([]);
});

test("sorts the queue by createdAt and overwrites duplicate ids", () => {
  enqueueSubmission({
    id: "late",
    endpoint: "/api/child/attempts",
    body: JSON.stringify({ sessionItemId: "item-2" }),
    clientSubmissionId: "11111111-1111-4111-8111-111111111111",
    createdAt: 20,
  });
  enqueueSubmission({
    id: "early",
    endpoint: "/api/child/diagnosis",
    body: JSON.stringify({ sessionItemId: "item-1" }),
    clientSubmissionId: "22222222-2222-4222-8222-222222222222",
    createdAt: 10,
  });
  enqueueSubmission({
    id: "late",
    endpoint: "/api/child/attempts",
    body: JSON.stringify({ sessionItemId: "item-2", answerText: "42" }),
    clientSubmissionId: "33333333-3333-4333-8333-333333333333",
    createdAt: 15,
  });

  expect(readSubmissionQueue()).toEqual([
    {
      id: "early",
      endpoint: "/api/child/diagnosis",
      body: JSON.stringify({ sessionItemId: "item-1" }),
      clientSubmissionId: "22222222-2222-4222-8222-222222222222",
      createdAt: 10,
    },
    {
      id: "late",
      endpoint: "/api/child/attempts",
      body: JSON.stringify({ sessionItemId: "item-2", answerText: "42" }),
      clientSubmissionId: "33333333-3333-4333-8333-333333333333",
      createdAt: 15,
    },
  ]);

  removeSubmission("early");
  expect(readSubmissionQueue()).toEqual([
    {
      id: "late",
      endpoint: "/api/child/attempts",
      body: JSON.stringify({ sessionItemId: "item-2", answerText: "42" }),
      clientSubmissionId: "33333333-3333-4333-8333-333333333333",
      createdAt: 15,
    },
  ]);
});

test("does not write apiKey or response fields into queued bodies", () => {
  enqueueSubmission({
    id: "queued-1",
    endpoint: "/api/child/attempts",
    body: JSON.stringify({
      sessionItemId: "item-1",
      answerText: "12",
      apiKey: "secret",
      response: { normalizedAnswer: "12" },
    }),
    clientSubmissionId: "44444444-4444-4444-8444-444444444444",
    createdAt: 10,
  });

  expect(readSubmissionQueue()).toEqual([
    {
      id: "queued-1",
      endpoint: "/api/child/attempts",
      body: JSON.stringify({ sessionItemId: "item-1", answerText: "12" }),
      clientSubmissionId: "44444444-4444-4444-8444-444444444444",
      createdAt: 10,
    },
  ]);
});

test("silently returns empty results when localStorage is unavailable", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("quota");
  });
  expect(() => writeDraft({ sessionItemId: "item-1", answerText: "12", updatedAt: 10 })).not.toThrow();
  expect(() => enqueueSubmission({
    id: "queued-1",
    endpoint: "/api/child/attempts",
    body: JSON.stringify({ sessionItemId: "item-1" }),
    clientSubmissionId: "55555555-5555-4555-8555-555555555555",
    createdAt: 10,
  })).not.toThrow();

  vi.restoreAllMocks();
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });

  expect(readDraft("item-1")).toBeNull();
  expect(readSubmissionQueue()).toEqual([]);
  expect(() => clearDraft("item-1")).not.toThrow();
  expect(() => removeSubmission("queued-1")).not.toThrow();
});
