import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { createDatabase } from "@/db/client";
import { migrateDatabase } from "@/db/migrate";
import {
  attempts,
  diagnosticRuns,
  hintEvents,
  questionTemplates,
  sessionItems,
  skills,
  trainingSessions,
  users,
} from "@/db/schema";
import { createTestDatabase } from "@/test/test-db";
import { revealNextHint } from "@/services/training/reveal-hint";

const testState = vi.hoisted(() => ({
  db: undefined as unknown,
  getCurrentUser: vi.fn(),
}));

vi.mock("@/db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/client")>();
  return { ...actual, getDatabase: () => testState.db };
});

vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: testState.getCurrentUser }));

import { POST } from "./route";

type TestDatabase = ReturnType<typeof createTestDatabase>;
let db: TestDatabase;

beforeEach(() => {
  testState.getCurrentUser.mockReset();
  testState.getCurrentUser.mockResolvedValue({ id: "child-1", role: "child", displayName: "孩子" });
  db = createTestDatabase();
  testState.db = db;
  db.insert(users).values([
    { id: "child-1", role: "child", displayName: "孩子", credentialHash: "hash", createdAt: 1 },
    { id: "child-2", role: "child", displayName: "另一个孩子", credentialHash: "hash", createdAt: 1 },
    { id: "parent-1", role: "parent", displayName: "家长", credentialHash: "hash", createdAt: 1 },
  ]).run();
  db.insert(skills).values({ id: "skill-1", code: "skill-1", name: "能力", domain: "数与运算" }).run();
  db.insert(questionTemplates).values({
    id: "template-1",
    skillId: "skill-1",
    stem: "1 + 1 = ?",
    answerSpec: JSON.stringify({ kind: "number", value: 2, tolerance: 0, unit: null }),
    explanation: "答案是 2。",
    difficulty: 1,
  }).run();
  db.insert(trainingSessions).values([
    { id: "session-1", childId: "child-1", sessionDate: "2026-08-20", kind: "daily", status: "in_progress", startedAt: 1 },
    { id: "session-2", childId: "child-2", sessionDate: "2026-08-20", kind: "daily", status: "in_progress", startedAt: 1 },
    { id: "session-completed", childId: "child-1", sessionDate: "2026-08-21", kind: "daily", status: "completed", startedAt: 1, completedAt: 2 },
  ]).run();
  db.insert(sessionItems).values([
    item("item-1", "session-1"),
    item("item-foreign", "session-2"),
    item("item-completed", "session-completed"),
  ]).run();
});

function item(id: string, sessionId: string) {
  return {
    id,
    sessionId,
    questionTemplateId: "template-1",
    position: 0,
    stemSnapshot: "1 + 1 = ?",
    answerSpecSnapshot: JSON.stringify({ kind: "number", value: 2, tolerance: 0, unit: null }),
    explanationSnapshot: "答案是 2。",
    skillIdSnapshot: "skill-1",
    skillNameSnapshot: "能力",
    selectionReasonSnapshot: JSON.stringify({
      estimatedSeconds: 60,
      hintLadder: ["先判断运算。", "想想加法的含义。", "把两个 1 合起来。"],
    }),
  };
}

function hintRequest(sessionItemId: string) {
  return new Request("http://localhost/api/child/hints", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionItemId }),
  });
}

test("reveals snapshot hints in order and repeats level three without another event", async () => {
  const responses = [];
  for (let index = 0; index < 4; index += 1) {
    const response = await POST(hintRequest("item-1"));
    expect(response.status).toBe(200);
    responses.push(await response.json());
  }

  expect(responses).toEqual([
    { level: 1, hint: "先判断运算。", hintCount: 1 },
    { level: 2, hint: "想想加法的含义。", hintCount: 2 },
    { level: 3, hint: "把两个 1 合起来。", hintCount: 3 },
    { level: 3, hint: "把两个 1 合起来。", hintCount: 3 },
  ]);
  expect(db.select().from(hintEvents).where(eq(hintEvents.sessionItemId, "item-1")).all())
    .toHaveLength(3);
});

test("keeps hint progression durable across separate database connections", () => {
  const directory = mkdtempSync(join(tmpdir(), "math-trainer-hints-"));
  const filename = join(directory, "hints.sqlite");
  const first = createDatabase(filename);
  migrateDatabase(first, join(process.cwd(), "drizzle"));
  first.$client.exec("PRAGMA journal_mode = WAL");
  first.insert(users).values({
    id: "child-1", role: "child", displayName: "孩子", credentialHash: "hash", createdAt: 1,
  }).run();
  first.insert(skills).values({ id: "skill-1", code: "skill-1", name: "能力", domain: "数与运算" }).run();
  first.insert(questionTemplates).values({
    id: "template-1", skillId: "skill-1", stem: "1 + 1 = ?",
    answerSpec: JSON.stringify({ kind: "number", value: 2, tolerance: 0, unit: null }),
    explanation: "答案是 2。", difficulty: 1,
  }).run();
  first.insert(trainingSessions).values({
    id: "session-1", childId: "child-1", sessionDate: "2026-08-20",
    kind: "daily", status: "in_progress", startedAt: 1,
  }).run();
  first.insert(sessionItems).values(item("item-1", "session-1")).run();
  const second = createDatabase(filename);
  second.$client.exec("PRAGMA journal_mode = WAL");

  try {
    expect(revealNextHint(first, "child-1", "item-1")).toMatchObject({ level: 1, hintCount: 1 });
    expect(revealNextHint(second, "child-1", "item-1")).toMatchObject({ level: 2, hintCount: 2 });
    expect(revealNextHint(first, "child-1", "item-1")).toMatchObject({ level: 3, hintCount: 3 });
    expect(revealNextHint(second, "child-1", "item-1")).toMatchObject({ level: 3, hintCount: 3 });
    expect(first.select().from(hintEvents).all()).toHaveLength(3);
  } finally {
    first.$client.close();
    second.$client.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test.each([
  { user: null, status: 401, error: "Authentication required" },
  { user: { id: "parent-1", role: "parent", displayName: "家长" }, status: 403, error: "Child access required" },
])("returns safe JSON when hint authentication fails", async ({ user, status, error }) => {
  testState.getCurrentUser.mockResolvedValue(user);
  const response = await POST(hintRequest("item-1"));
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ error });
});

test.each(["missing", "item-foreign", "item-completed"])(
  "does not reveal hints for missing, foreign, or completed items: %s",
  async (sessionItemId) => {
    const response = await POST(hintRequest(sessionItemId));
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toEqual({ error: "Training item not found" });
    expect(JSON.stringify(body)).not.toContain("答案");
  },
);

test("rejects diagnostic items and already-correct formal items", async () => {
  db.insert(diagnosticRuns).values({
    id: "run-1", childId: "child-1", version: 1, status: "in_progress",
    currentPart: 1, seed: "seed", startedAt: 1,
  }).run();
  db.insert(trainingSessions).values({
    id: "diagnostic-session", childId: "child-1", sessionDate: "2026-08-20",
    kind: "diagnostic", diagnosticRunId: "run-1", diagnosticPartNumber: 1,
    status: "in_progress", startedAt: 1,
  }).run();
  db.insert(sessionItems).values(item("diagnostic-item", "diagnostic-session")).run();
  db.insert(attempts).values({
    id: "attempt-1", sessionItemId: "item-1", clientSubmissionId: "11111111-1111-4111-8111-111111111111",
    answerText: "2", isCorrect: true, normalizedAnswer: "2", explanation: "答案是 2。",
    sessionCompleted: false, submittedAt: 2,
  }).run();

  for (const sessionItemId of ["diagnostic-item", "item-1"]) {
    const response = await POST(hintRequest(sessionItemId));
    expect(response.status).toBe(404);
  }
  expect(db.select().from(hintEvents).all()).toHaveLength(0);
});

test("rejects malformed input and never exposes answer or explanation fields", async () => {
  const malformed = await POST(new Request("http://localhost/api/child/hints", {
    method: "POST",
    body: JSON.stringify({ sessionItemId: "" }),
  }));
  expect(malformed.status).toBe(400);

  const response = await POST(hintRequest("item-1"));
  const body = await response.json();
  expect(body).not.toHaveProperty("answerSpec");
  expect(body).not.toHaveProperty("explanation");
  expect(JSON.stringify(body)).not.toContain("答案是 2");
});
