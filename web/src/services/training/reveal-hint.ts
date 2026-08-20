import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { attempts, hintEvents, sessionItems, trainingSessions } from "@/db/schema";

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
): HintResult {
  return db.transaction((tx) => {
    const item = tx.select({
      sessionKind: trainingSessions.kind,
      metadataSnapshot: sessionItems.selectionReasonSnapshot,
    }).from(sessionItems)
      .innerJoin(trainingSessions, eq(sessionItems.sessionId, trainingSessions.id))
      .where(and(
        eq(sessionItems.id, sessionItemId),
        eq(trainingSessions.childId, childId),
        eq(trainingSessions.status, "in_progress"),
      ))
      .get();
    if (!item || item.sessionKind === "diagnostic") throw new HintAccessError();

    const alreadyCorrect = tx.select({ id: attempts.id }).from(attempts)
      .where(and(eq(attempts.sessionItemId, sessionItemId), eq(attempts.isCorrect, true)))
      .limit(1)
      .get();
    if (alreadyCorrect) throw new HintAccessError();

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
        revealedAt: Date.now(),
      }).run();
    }

    return { level, hint: ladder[level - 1], hintCount: Math.max(count, level) };
  }, { behavior: "immediate" });
}
