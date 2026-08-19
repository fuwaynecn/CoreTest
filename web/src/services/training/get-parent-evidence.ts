import { desc, eq, sql } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import {
  attempts,
  masteryStates,
  questionTemplates,
  sessionItems,
  skills,
  trainingSessions,
} from "@/db/schema";

export type ParentEvidence = {
  summary: { answered: number; correct: number; accuracy: number | null };
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

export function getParentEvidence(db: AppDatabase, childId: string): ParentEvidence {
  return db.transaction((tx) => {
    const summary = tx.select({
      answered: sql<number>`count(*)`,
      correct: sql<number>`coalesce(sum(case when ${attempts.isCorrect} then 1 else 0 end), 0)`,
    }).from(attempts)
      .innerJoin(sessionItems, eq(attempts.sessionItemId, sessionItems.id))
      .innerJoin(trainingSessions, eq(sessionItems.sessionId, trainingSessions.id))
      .where(eq(trainingSessions.childId, childId))
      .get() ?? { answered: 0, correct: 0 };

    const recent = tx.select({
      stem: questionTemplates.stem,
      answerText: attempts.answerText,
      correct: attempts.isCorrect,
      submittedAt: attempts.submittedAt,
      skillName: skills.name,
    }).from(attempts)
      .innerJoin(sessionItems, eq(attempts.sessionItemId, sessionItems.id))
      .innerJoin(trainingSessions, eq(sessionItems.sessionId, trainingSessions.id))
      .innerJoin(questionTemplates, eq(sessionItems.questionTemplateId, questionTemplates.id))
      .innerJoin(skills, eq(questionTemplates.skillId, skills.id))
      .where(eq(trainingSessions.childId, childId))
      .orderBy(desc(attempts.submittedAt), desc(attempts.id))
      .limit(20)
      .all();

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
      summary: {
        ...summary,
        accuracy: summary.answered === 0 ? null : summary.correct / summary.answered,
      },
      recent,
      skills: skillEvidence,
    };
  });
}
