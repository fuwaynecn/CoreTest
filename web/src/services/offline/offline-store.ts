export type DraftRecord = {
  sessionItemId: string;
  answerText?: string;
  readingCardResponse?: Record<string, string>;
  updatedAt: number;
};

export type QueuedSubmission = {
  id: string;
  endpoint: "/api/child/attempts" | "/api/child/diagnosis";
  body: string;
  clientSubmissionId: string;
  createdAt: number;
};

const DRAFT_PREFIX = "math-offline:draft:";
const QUEUE_KEY = "math-offline:submission-queue";

function readStorage(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function writeStorage(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch {}
}

function removeStorage(key: string): void {
  try { localStorage.removeItem(key); } catch {}
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return typeof value === "object" && value !== null && Object.values(value).every((item) => typeof item === "string");
}

function isDraftRecord(value: unknown): value is DraftRecord {
  return typeof value === "object" && value !== null && "sessionItemId" in value && typeof value.sessionItemId === "string"
    && (!("answerText" in value) || value.answerText === undefined || typeof value.answerText === "string")
    && (!("readingCardResponse" in value) || value.readingCardResponse === undefined || isStringRecord(value.readingCardResponse))
    && "updatedAt" in value && typeof value.updatedAt === "number";
}

function isEndpoint(value: unknown): value is QueuedSubmission["endpoint"] {
  return value === "/api/child/attempts" || value === "/api/child/diagnosis";
}

function isQueuedSubmission(value: unknown): value is QueuedSubmission {
  return typeof value === "object" && value !== null && "id" in value && typeof value.id === "string"
    && "endpoint" in value && isEndpoint(value.endpoint) && "body" in value && typeof value.body === "string"
    && "clientSubmissionId" in value && typeof value.clientSubmissionId === "string"
    && "createdAt" in value && typeof value.createdAt === "number";
}

function stripSensitiveFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSensitiveFields);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "apiKey" && key !== "response").map(([key, item]) => [key, stripSensitiveFields(item)]));
}

function sanitizeBody(body: string): string {
  try { return JSON.stringify(stripSensitiveFields(JSON.parse(body))); } catch { return body; }
}

function readQueueSnapshot(): QueuedSubmission[] {
  const raw = readStorage(QUEUE_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isQueuedSubmission).toSorted((left, right) => left.createdAt - right.createdAt) : [];
  } catch { return []; }
}

export function readDraft(sessionItemId: string): DraftRecord | null {
  const raw = readStorage(`${DRAFT_PREFIX}${sessionItemId}`);
  if (!raw) return null;
  try { const parsed: unknown = JSON.parse(raw); return isDraftRecord(parsed) ? parsed : null; } catch { return null; }
}

export function writeDraft(record: DraftRecord): void {
  if (isDraftRecord(record)) writeStorage(`${DRAFT_PREFIX}${record.sessionItemId}`, JSON.stringify(record));
}

export function clearDraft(sessionItemId: string): void { removeStorage(`${DRAFT_PREFIX}${sessionItemId}`); }

export function enqueueSubmission(item: QueuedSubmission): void {
  if (!isQueuedSubmission(item)) return;
  const next = readQueueSnapshot().filter((entry) => entry.id !== item.id);
  next.push({ ...item, body: sanitizeBody(item.body) });
  writeStorage(QUEUE_KEY, JSON.stringify(next.toSorted((left, right) => left.createdAt - right.createdAt)));
}

export function readSubmissionQueue(): QueuedSubmission[] { return readQueueSnapshot(); }

export function removeSubmission(id: string): void {
  writeStorage(QUEUE_KEY, JSON.stringify(readQueueSnapshot().filter((entry) => entry.id !== id)));
}
