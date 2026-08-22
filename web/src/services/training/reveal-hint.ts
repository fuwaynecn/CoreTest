import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import {
  attempts, diagnosticRuns, hintEvents, hintRequests, sessionItems, trainingSessions,
} from "@/db/schema";

export type HintResult = {
  level: 1 | 2 | 3;
  hint: string;
  hintCount: number;
};

export class HintAccessError extends Error {
  constructor() {
    super("Training item is not available");
    this.name = "HintAccessError";
  }
}

function parseHintLadder(snapshot: string): [string, string, string] {
  let metadata: unknown;
  try {
    metadata = JSON.parse(snapshot);
  } catch {
    throw new HintAccessError();
  }
  if (typeof metadata !== "object" || metadata === null || !("hintLadder" in metadata)) {
    throw new HintAccessError();
  }
  const ladder = metadata.hintLadder;
  if (!Array.isArray(ladder) || ladder.length !== 3
    || !ladder.every((hint) => typeof hint === "string" && hint.trim().length > 0)) {
    throw new HintAccessError();
  }
  return ladder as [string, string, string];
}

export function revealNextHint(
  db: AppDatabase,
  childId: string,
  sessionItemId: string,
  requestId: string,
  now = Date.now(),
): HintResult {
  return db.transaction((tx) => {
    const replay = tx.select({
      childId: hintRequests.childId,
      sessionItemId: hintRequests.sessionItemId,
      level: hintRequests.hintLevel,
      metadataSnapshot: sessionItems.selectionReasonSnapshot,
    }).from(hintRequests)
      .innerJoin(sessionItems, eq(hintRequests.sessionItemId, sessionItems.id))
      .where(eq(hintRequests.requestId, requestId))
      .get();
    if (replay) {
      if (replay.childId !== childId || replay.sessionItemId !== sessionItemId) {
        throw new HintAccessError();
      }
      const level = replay.level as 1 | 2 | 3;
      return {
        level,
        hint: parseHintLadder(replay.metadataSnapshot)[level - 1],
        hintCount: level,
      };
    }

    const item = tx.select({
      sessionId: trainingSessions.id,
      position: sessionItems.position,
      sessionKind: trainingSessions.kind,
      diagnosticPartNumber: trainingSessions.diagnosticPartNumber,
      diagnosticStatus: diagnosticRuns.status,
      diagnosticCurrentPart: diagnosticRuns.currentPart,
      metadataSnapshot: sessionItems.selectionReasonSnapshot,
    }).from(sessionItems)
      .innerJoin(trainingSessions, eq(sessionItems.sessionId, trainingSessions.id))
      .leftJoin(diagnosticRuns, eq(trainingSessions.diagnosticRunId, diagnosticRuns.id))
      .where(and(
        eq(sessionItems.id, sessionItemId),
        eq(trainingSessions.childId, childId),
        eq(trainingSessions.status, "in_progress"),
      ))
      .get();
    if (!item) throw new HintAccessError();
    if (item.sessionKind === "diagnostic"
      && (item.diagnosticStatus !== "in_progress"
        || item.diagnosticPartNumber !== item.diagnosticCurrentPart)) {
      throw new HintAccessError();
    }
    if (item.sessionKind === "diagnostic") {
      const current = tx.select({ id: sessionItems.id }).from(sessionItems)
        .where(eq(sessionItems.sessionId, item.sessionId))
        .orderBy(asc(sessionItems.position))
        .all().at(-1);
      if (current?.id !== sessionItemId) throw new HintAccessError();
    }

    const terminalAttempt = tx.select({ id: attempts.id }).from(attempts)
      .where(item.sessionKind === "diagnostic"
        ? eq(attempts.sessionItemId, sessionItemId)
        : and(
          eq(attempts.sessionItemId, sessionItemId),
          eq(attempts.isCorrect, true),
        ))
      .limit(1)
      .get();
    if (terminalAttempt) throw new HintAccessError();

    const ladder = parseHintLadder(item.metadataSnapshot);
    const revealed = tx.select({ level: hintEvents.hintLevel }).from(hintEvents)
      .where(and(
        eq(hintEvents.sessionItemId, sessionItemId),
        eq(hintEvents.childId, childId),
      ))
      .orderBy(asc(hintEvents.hintLevel))
      .all();
    const count = Math.min(revealed.length, 3);
    const level = Math.min(count + 1, 3) as 1 | 2 | 3;

    if (count < 3) {
      tx.insert(hintEvents).values({
        id: randomUUID(),
        childId,
        sessionItemId,
        hintLevel: level,
        revealedAt: now,
      }).run();
    }

    tx.insert(hintRequests).values({
      requestId,
      childId,
      sessionItemId,
      hintLevel: level,
      requestedAt: now,
    }).run();

    return { level, hint: ladder[level - 1], hintCount: Math.max(count, level) };
  }, { behavior: "immediate" });
}
