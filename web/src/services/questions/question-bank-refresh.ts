import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { phase2Catalog } from "@/content/phase2-catalog";
import type { AppDatabase } from "@/db/client";
import { questionBankRefreshes, questionInstances } from "@/db/schema";
import {
  instantiateTemplateAtIndex,
  questionFingerprint,
  variantPeriod,
} from "@/domain/questions/instantiate-template";
import { renderedQuestionErrors } from "@/domain/questions/formal-template-validation";
import { addShanghaiDays, shanghaiWeekKey } from "@/domain/time/shanghai-calendar";
import { validateCatalog } from "@/domain/questions/template-schema";

export type QuestionBankRefreshOptions = {
  skillIds?: readonly string[];
  force?: boolean;
  now?: number;
};

export type QuestionBankRefreshResult = {
  skipped: boolean;
  generated: number;
  errors: string[];
};

const MAX_INSERTS = 40;
const MIN_INVENTORY = 8;
const TARGET_INVENTORY = 12;

function dateAtShanghaiMidnight(date: string) {
  return Date.parse(`${date}T00:00:00+08:00`);
}

function stableVariantErrors(templateId: string, index: number, errors: readonly string[]) {
  return errors.filter((error) => error.startsWith(`${templateId}:`) && error.endsWith(`:variant-${index}`));
}

export function ensureQuestionBankFresh(
  db: AppDatabase,
  date: string,
  options: QuestionBankRefreshOptions = {},
): QuestionBankRefreshResult {
  const weekKey = shanghaiWeekKey(new Date(`${date}T12:00:00+08:00`));
  const scoped = options.skillIds !== undefined;
  const now = options.now ?? Date.now();

  return db.transaction((tx) => {
    if (!scoped && !options.force && tx.select({ weekKey: questionBankRefreshes.weekKey })
      .from(questionBankRefreshes).where(eq(questionBankRefreshes.weekKey, weekKey)).get()) {
      return { skipped: true, generated: 0, errors: [] };
    }

    const allowedSkills = options.skillIds ? new Set(options.skillIds) : null;
    const cutoff = dateAtShanghaiMidnight(addShanghaiDays(date, -30));
    const inventory = new Map<string, number>();
    for (const row of tx.select({ skillId: questionInstances.skillId, difficulty: questionInstances.difficulty, lastUsedAt: questionInstances.lastUsedAt })
      .from(questionInstances).where(eq(questionInstances.active, true)).all()) {
      if (row.lastUsedAt !== null && row.lastUsedAt >= cutoff) continue;
      const key = `${row.skillId}:${row.difficulty}`;
      inventory.set(key, (inventory.get(key) ?? 0) + 1);
    }

    const catalogErrors = validateCatalog(phase2Catalog);
    const errors = new Set<string>();
    let generated = 0;
    let stop = false;

    for (const template of phase2Catalog) {
      const skillId = `skill-${template.skillCode}`;
      if (allowedSkills && !allowedSkills.has(skillId)) continue;
      const cell = `${skillId}:${template.difficulty}`;
      if ((inventory.get(cell) ?? 0) >= MIN_INVENTORY) continue;

      for (let index = 0; index < variantPeriod(template) && (inventory.get(cell) ?? 0) < TARGET_INVENTORY; index += 1) {
        const knownErrors = stableVariantErrors(template.id, index, catalogErrors);
        if (knownErrors.length) {
          knownErrors.forEach((error) => errors.add(error));
          continue;
        }

        try {
          const instance = instantiateTemplateAtIndex(template, index, `question-bank:${template.id}:${index}`);
          const renderedErrors = renderedQuestionErrors({
            answerMode: template.answerMode,
            stem: instance.stem,
            answerSpec: instance.answerSpec,
          });
          if (renderedErrors.length) {
            renderedErrors.forEach((error) => errors.add(`${template.id}:${error}:variant-${index}`));
            continue;
          }

          const fingerprint = questionFingerprint(instance);
          const result = tx.insert(questionInstances).values({
            id: randomUUID(),
            templateId: instance.templateId,
            skillId,
            variantSeed: instance.variantSeed,
            variables: JSON.stringify(instance.variables),
            stem: instance.stem,
            answerSpec: JSON.stringify(instance.answerSpec),
            explanation: instance.explanation,
            difficulty: instance.difficulty,
            fingerprint,
            active: true,
            generatedAt: now,
            updatedAt: now,
          }).onConflictDoNothing({ target: questionInstances.fingerprint }).run();
          if (Number(result.changes) > 0) {
            generated += 1;
            inventory.set(cell, (inventory.get(cell) ?? 0) + 1);
            if (generated >= MAX_INSERTS) {
              stop = true;
              break;
            }
          }
        } catch (error) {
          errors.add(`${template.id}:invalid_variant:${index}:${error instanceof Error ? error.message : "unknown"}`);
        }
      }
      if (stop) break;
    }

    if (!scoped) {
      tx.insert(questionBankRefreshes).values({
        weekKey,
        completedAt: now,
        generatedCount: generated,
        errors: JSON.stringify([...errors]),
      }).onConflictDoUpdate({
        target: questionBankRefreshes.weekKey,
        set: { completedAt: now, generatedCount: generated, errors: JSON.stringify([...errors]) },
      }).run();
    }
    return { skipped: false, generated, errors: [...errors] };
  }, { behavior: "immediate" });
}
