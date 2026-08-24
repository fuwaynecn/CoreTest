import type { PlanCategory } from "@/domain/planning/build-six-week-plan";
import type { DailyComposition } from "./allocate-composition";

export type ScheduledCandidate = {
  templateId: string; skillId: string; structureTag: string; category: PlanCategory;
  difficulty: 1 | 2 | 3 | 4; estimatedSeconds: number; dueOn: string | null;
  masteryRank?: number; targetDifficulty?: number;
};
export type ScheduledItem = ScheduledCandidate & { variantSeed: string; selectionReason: string; position: number };
export type SelectionResult = { items: ScheduledItem[]; shortages: Partial<Record<PlanCategory, number>> };

const categories: PlanCategory[] = ["review", "weakness", "reading", "extension"];

function daysLate(date: string, dueOn: string | null) {
  if (!dueOn) return 0;
  return Math.max(0, Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${dueOn}T00:00:00Z`)) / 86_400_000));
}

export function selectDailyItems(input: { candidates: readonly ScheduledCandidate[]; composition: DailyComposition; targetSeconds: number; date: string; seed: string }): SelectionResult {
  const ordered = [...input.candidates].sort((left, right) => (
    daysLate(input.date, right.dueOn) - daysLate(input.date, left.dueOn)
    || (left.masteryRank ?? 0) - (right.masteryRank ?? 0)
    || Math.abs(left.difficulty - (left.targetDifficulty ?? left.difficulty)) - Math.abs(right.difficulty - (right.targetDifficulty ?? right.difficulty))
    || left.templateId.localeCompare(right.templateId)
  ));
  const items: ScheduledItem[] = [];
  const shortages: Partial<Record<PlanCategory, number>> = {};
  const templates = new Set<string>(); const structures = new Map<string, number>(); const reviews = new Map<string, number>();
  const select = (category: PlanCategory, requested: number) => {
    let added = 0;
    for (const candidate of ordered) {
      if (added === requested || candidate.category !== category || templates.has(candidate.templateId)) continue;
      if ((structures.get(candidate.structureTag) ?? 0) >= 6) continue;
      if (category === "review" && (reviews.get(candidate.skillId) ?? 0) >= 2) continue;
      const used = items.reduce((sum, item) => sum + item.estimatedSeconds, 0);
      if (used + candidate.estimatedSeconds > input.targetSeconds + candidate.estimatedSeconds) continue;
      templates.add(candidate.templateId); structures.set(candidate.structureTag, (structures.get(candidate.structureTag) ?? 0) + 1);
      if (category === "review") reviews.set(candidate.skillId, (reviews.get(candidate.skillId) ?? 0) + 1);
      const position = items.length;
      items.push({ ...candidate, position, variantSeed: `${input.seed}:${position + 1}:${candidate.templateId}`, selectionReason: category === "review" ? (candidate.dueOn && candidate.dueOn < input.date ? "overdue_review" : "due_review") : category });
      added += 1;
    }
    if (added < requested) shortages[category] = requested - added;
  };
  for (const category of categories) select(category, input.composition[category]);
  let reallocate = Object.values(shortages).reduce((sum, shortage) => sum + shortage, 0);
  for (const category of ["weakness", "reading"] as const) {
    if (!reallocate) break;
    const before = items.length;
    select(category, reallocate);
    reallocate -= items.length - before;
  }
  return { items, shortages };
}
