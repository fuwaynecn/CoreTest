import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { attempts, errorObservations, trainingSessions, sessionItems, users } from "@/db/schema";
import type { ErrorCause } from "@/domain/learning/contracts";
import { errorCategory } from "@/domain/errors/classify-error";

export const childReflections = [
  "did_not_read", "missed_condition_or_unit", "calculation_slip", "method_unknown",
] as const;
export type ChildReflection = typeof childReflections[number];

const reflectionCause: Record<ChildReflection, ErrorCause> = {
  did_not_read: "incomplete_reading",
  missed_condition_or_unit: "missing_unit",
  calculation_slip: "calculation",
  method_unknown: "relationship",
};

export class ErrorObservationAccessError extends Error {
  constructor() { super("Error observation is not available"); this.name = "ErrorObservationAccessError"; }
}
export class ErrorObservationConflictError extends Error {
  constructor() { super("Error observation has already been recorded"); this.name = "ErrorObservationConflictError"; }
}

type Observation = typeof errorObservations.$inferSelect;
type ObservationReader = Pick<AppDatabase, "select">;

function chainForItem(db: ObservationReader, childId: string, sessionItemId: string): Observation[] {
  const observations = db.select().from(errorObservations).where(and(
    eq(errorObservations.childId, childId),
    eq(errorObservations.sessionItemId, sessionItemId),
  )).all();
  const root = observations.find((entry) => entry.source === "system" && entry.previousObservationId === null);
  if (!root) return [];
  const chain = [root];
  while (true) {
    const next = observations.find((entry) => entry.previousObservationId === chain.at(-1)!.id);
    if (!next) return chain;
    chain.push(next);
  }
}

function valueOf(observation: Observation): ErrorCause | ChildReflection {
  if (observation.parentCorrection) return observation.parentCorrection;
  if (observation.childSelfReport) return observation.childSelfReport;
  if (observation.systemCandidate) return observation.systemCandidate;
  return "unknown";
}

function rootAndChain(db: ObservationReader, observationId: string): { root: Observation; chain: Observation[] } {
  const selected = db.select().from(errorObservations).where(eq(errorObservations.id, observationId)).get();
  if (!selected) throw new ErrorObservationAccessError();
  const chain = chainForItem(db, selected.childId, selected.sessionItemId);
  const root = chain.find((entry) => entry.source === "system" && entry.previousObservationId === null);
  if (!root) throw new ErrorObservationAccessError();
  return { root, chain };
}

export function saveChildReflection(db: AppDatabase, command: {
  childId: string;
  sessionItemId: string;
  reflection: ChildReflection;
  now?: number;
}): Observation {
  return db.transaction((tx) => {
    const actor = tx.select({ role: users.role }).from(users).where(eq(users.id, command.childId)).get();
    if (actor?.role !== "child") throw new ErrorObservationAccessError();
    const owned = tx.select({ id: sessionItems.id }).from(sessionItems)
      .innerJoin(trainingSessions, eq(sessionItems.sessionId, trainingSessions.id))
      .where(and(eq(sessionItems.id, command.sessionItemId), eq(trainingSessions.childId, command.childId))).get();
    if (!owned) throw new ErrorObservationAccessError();

    const wrongFirst = tx.select({ correct: attempts.isCorrect }).from(attempts)
      .where(eq(attempts.sessionItemId, command.sessionItemId))
      .orderBy(asc(attempts.submittedAt), asc(attempts.id)).limit(1).get();
    if (!wrongFirst || wrongFirst.correct) throw new ErrorObservationAccessError();

    const chain = chainForItem(tx, command.childId, command.sessionItemId);
    const root = chain.find((entry) => entry.source === "system");
    if (!root) throw new ErrorObservationAccessError();
    const existing = chain.find((entry) => entry.source === "child");
    if (existing) {
      if (existing.childSelfReport === command.reflection) return existing;
      throw new ErrorObservationConflictError();
    }

    const previous = chain.at(-1)!;
    const now = command.now ?? Date.now();
    const inserted = {
      id: randomUUID(), childId: command.childId, sessionItemId: command.sessionItemId,
      attemptId: root.attemptId, source: "child" as const, systemCandidate: null,
      childSelfReport: command.reflection, parentCorrection: null,
      previousValue: valueOf(previous), previousObservationId: previous.id,
      actorId: command.childId, observedAt: now, createdAt: now,
    };
    tx.insert(errorObservations).values(inserted).run();
    return inserted;
  }, { behavior: "immediate" });
}

export function correctErrorObservation(db: AppDatabase, command: {
  actorId: string;
  configuredChildId: string;
  observationId: string;
  cause: ErrorCause;
  now?: number;
}): Observation {
  return db.transaction((tx) => {
    const actor = tx.select({ role: users.role }).from(users).where(eq(users.id, command.actorId)).get();
    if (actor?.role !== "parent") throw new ErrorObservationAccessError();
    const { root, chain } = rootAndChain(tx, command.observationId);
    if (root.childId !== command.configuredChildId) throw new ErrorObservationAccessError();
    const previous = chain.at(-1)!;
    if (previous.source === "parent" && previous.parentCorrection === command.cause) return previous;
    const now = command.now ?? Date.now();
    const inserted = {
      id: randomUUID(), childId: root.childId, sessionItemId: root.sessionItemId,
      attemptId: root.attemptId, source: "parent" as const, systemCandidate: null,
      childSelfReport: null, parentCorrection: command.cause,
      previousValue: valueOf(previous), previousObservationId: previous.id,
      actorId: command.actorId, observedAt: now, createdAt: now,
    };
    tx.insert(errorObservations).values(inserted).run();
    return inserted;
  }, { behavior: "immediate" });
}

export function getEffectiveErrorCause(db: AppDatabase, observationId: string) {
  const { root, chain } = rootAndChain(db, observationId);
  const parent = [...chain].reverse().find((entry) => entry.source === "parent");
  const child = chain.find((entry) => entry.source === "child");
  const cause = parent?.parentCorrection
    ?? (child?.childSelfReport ? reflectionCause[child.childSelfReport] : root.systemCandidate)
    ?? "unknown";
  return { cause, category: errorCategory(cause), source: parent ? "parent" : child ? "child" : "system" } as const;
}
