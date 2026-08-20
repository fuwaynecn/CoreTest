import {
  attempts,
  diagnosticParts,
  diagnosticRuns,
  questionTemplates,
  sessionItems,
  skills,
  trainingSessions,
  users,
} from "@/db/schema";
import { phase1DailySkills, phase1DailyTemplates } from "@/content/phase1-daily";
import { getOrCreateDailySession } from "@/services/training/create-daily-session";
import { createTestDatabase } from "@/test/test-db";

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
  db.insert(users).values({
    id: "child-1",
    role: "child",
    displayName: "孩子",
    credentialHash: "hash",
    createdAt: 1,
  }).run();
  db.insert(diagnosticRuns).values({
    id: "completed-diagnosis", childId: "child-1", version: 1, status: "completed",
    currentPart: 3, seed: "completed", startedAt: 1, completedAt: 2, reportSnapshot: "{}",
  }).run();
  for (const skill of phase1DailySkills) db.insert(skills).values(skill).run();
  for (const template of phase1DailyTemplates) {
    db.insert(questionTemplates).values({
      ...template,
      answerSpec: JSON.stringify(template.answerSpec),
      commonErrors: JSON.stringify(template.commonErrors),
      active: true,
    }).run();
  }
});

function attemptRequest(body: unknown) {
  return new Request("http://localhost/api/child/attempts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("requires the child role and returns the scored attempt", async () => {
  const session = getOrCreateDailySession(db, "child-1", "2026-08-19");

  const response = await POST(attemptRequest({
    sessionItemId: session.questions[0].id,
    clientSubmissionId: "55555555-5555-4555-8555-555555555555",
    answerText: "6",
  }));

  expect(testState.getCurrentUser).toHaveBeenCalledOnce();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    correct: true,
    normalizedAnswer: "6",
    explanation: "把十分位对齐相加，结果是 6。",
    sessionCompleted: false,
  });
});

test.each([
  {
    user: null,
    status: 401,
    body: { error: "Authentication required" },
  },
  {
    user: { id: "parent-1", role: "parent", displayName: "家长" },
    status: 403,
    body: { error: "Child access required" },
  },
])("returns safe JSON $status when attempt authentication fails", async ({ user, status, body }) => {
  testState.getCurrentUser.mockResolvedValue(user);

  const response = await POST(attemptRequest({
    sessionItemId: "item",
    clientSubmissionId: "56565656-5656-4656-8656-565656565656",
    answerText: "6",
  }));

  expect(response.status).toBe(status);
  expect(response.headers.get("content-type")).toContain("application/json");
  expect(await response.json()).toEqual(body);
});

test("returns 400 for malformed attempt input", async () => {
  const response = await POST(attemptRequest({
    sessionItemId: "item",
    clientSubmissionId: "not-a-uuid",
    answerText: "1".repeat(129),
  }));

  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "Invalid attempt input" });
});

test("returns 404 when the item is not available to the signed-in child", async () => {
  const response = await POST(attemptRequest({
    sessionItemId: "missing-item",
    clientSubmissionId: "66666666-6666-4666-8666-666666666666",
    answerText: "6",
  }));

  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: "Training item not found" });
});

test("does not let the general attempt endpoint bypass diagnosis transitions", async () => {
  const daily = getOrCreateDailySession(db, "child-1", "2026-08-19");
  db.insert(diagnosticRuns).values({
    id: "run-1", childId: "child-1", version: 2, status: "in_progress",
    currentPart: 1, seed: "seed", startedAt: 1,
  }).run();
  db.insert(diagnosticParts).values({
    runId: "run-1", partNumber: 1, status: "in_progress", startedAt: 1,
  }).run();
  db.insert(trainingSessions).values({
    id: "diagnosis-session", childId: "child-1", sessionDate: "2026-08-19",
    kind: "diagnostic", diagnosticRunId: "run-1", diagnosticPartNumber: 1,
    status: "in_progress", startedAt: 1,
  }).run();
  db.insert(sessionItems).values({
    id: "diagnosis-item", sessionId: "diagnosis-session", questionTemplateId: "q-decimal-1",
    position: 1, stemSnapshot: "3.6 + 2.4 = ?",
    answerSpecSnapshot: JSON.stringify({ kind: "number", value: 6, tolerance: 0, unit: null }),
    explanationSnapshot: "对齐十分位。", skillIdSnapshot: "skill-decimal",
    skillNameSnapshot: "小数计算",
  }).run();

  const response = await POST(attemptRequest({
    sessionItemId: "diagnosis-item",
    clientSubmissionId: "77777777-7777-4777-8777-777777777777",
    answerText: "6",
  }));

  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: "Training item not found" });

  db.insert(attempts).values({
    id: "diagnosis-attempt", sessionItemId: "diagnosis-item",
    clientSubmissionId: "78787878-7878-4878-8878-787878787878",
    answerText: "6", isCorrect: true, normalizedAnswer: "6", explanation: "对齐十分位。",
    sessionCompleted: false, submittedAt: 2,
  }).run();
  const reverseReplay = await POST(attemptRequest({
    sessionItemId: daily.questions[0].id,
    clientSubmissionId: "78787878-7878-4878-8878-787878787878",
    answerText: "6",
  }));
  expect(reverseReplay.status).toBe(404);
  expect(await reverseReplay.json()).toEqual({ error: "Training item not found" });
});
