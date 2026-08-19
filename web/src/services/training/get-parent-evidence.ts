import { asc, eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import {
  attempts,
  masteryStates,
  sessionItems,
  skills,
  trainingSessions,
} from "@/db/schema";

export type ParentEvidence = {
  summary: {
    cumulative: EvidenceMetric;
    today: EvidenceMetric;
    week: EvidenceMetric;
  };
  recent: Array<{
    stem: string;
    answerText: string;
    correct: boolean;
    submittedAt: number;
    skillName: string;
  }>;
  skills: Array<{
    skillName: string;
    status: "needs_support" | "learning" | "basic";
    evidenceCount: number;
  }>;
};

type EvidenceMetric = { answered: number; correct: number; accuracy: number | null };

const DAY_MS = 24 * 60 * 60 * 1_000;
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1_000;

function shanghaiPeriodBoundaries(now: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(
    parts.find((part) => part.type === type)?.value,
  );
  const localCalendarDate = Date.UTC(value("year"), value("month") - 1, value("day"));
  const daysSinceMonday = (new Date(localCalendarDate).getUTCDay() + 6) % 7;
  const todayStart = localCalendarDate - SHANGHAI_OFFSET_MS;
  const weekStart = todayStart - daysSinceMonday * DAY_MS;

  return {
    todayStart,
    tomorrowStart: todayStart + DAY_MS,
    weekStart,
    nextWeekStart: weekStart + 7 * DAY_MS,
  };
}

function summarize(rows: Array<{ correct: boolean }>): EvidenceMetric {
  const answered = rows.length;
  const correct = rows.reduce((count, row) => count + Number(row.correct), 0);

  return { answered, correct, accuracy: answered === 0 ? null : correct / answered };
}

export function getParentEvidence(
  db: AppDatabase,
  childId: string,
  now = Date.now(),
): ParentEvidence {
  return db.transaction((tx) => {
    const attemptRows = tx.select({
      id: attempts.id,
      sessionItemId: attempts.sessionItemId,
      stem: sessionItems.stemSnapshot,
      answerText: attempts.answerText,
      correct: attempts.isCorrect,
      submittedAt: attempts.submittedAt,
      skillName: sessionItems.skillNameSnapshot,
    }).from(attempts)
      .innerJoin(sessionItems, eq(attempts.sessionItemId, sessionItems.id))
      .innerJoin(trainingSessions, eq(sessionItems.sessionId, trainingSessions.id))
      .where(eq(trainingSessions.childId, childId))
      .orderBy(asc(attempts.submittedAt), asc(attempts.id))
      .all();

    const firstAttempts = Array.from(attemptRows.reduce((byItem, attempt) => {
      if (!byItem.has(attempt.sessionItemId)) byItem.set(attempt.sessionItemId, attempt);
      return byItem;
    }, new Map<string, (typeof attemptRows)[number]>()).values());
    const boundaries = shanghaiPeriodBoundaries(now);
    const summary = {
      cumulative: summarize(firstAttempts),
      today: summarize(firstAttempts.filter((attempt) => (
        attempt.submittedAt >= boundaries.todayStart
        && attempt.submittedAt < boundaries.tomorrowStart
      ))),
      week: summarize(firstAttempts.filter((attempt) => (
        attempt.submittedAt >= boundaries.weekStart
        && attempt.submittedAt < boundaries.nextWeekStart
      ))),
    };
    const recent = attemptRows.slice(-20).reverse().map((attempt) => ({
      stem: attempt.stem,
      answerText: attempt.answerText,
      correct: attempt.correct,
      submittedAt: attempt.submittedAt,
      skillName: attempt.skillName,
    }));

    const skillEvidence = tx.select({
      skillName: skills.name,
      status: masteryStates.status,
      evidenceCount: masteryStates.evidenceCount,
    }).from(masteryStates)
      .innerJoin(skills, eq(masteryStates.skillId, skills.id))
      .where(eq(masteryStates.childId, childId))
      .orderBy(skills.name)
      .all();

    return {
      summary,
      recent,
      skills: skillEvidence,
    };
  });
}
