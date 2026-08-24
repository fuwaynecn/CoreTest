import type { PlanCategory } from "@/domain/planning/build-six-week-plan";

export type SpecialistFocus = "none" | "computation" | "equation" | "reading";
export type DailyComposition = Record<PlanCategory, number>;

const tieOrder: PlanCategory[] = ["review", "weakness", "reading", "extension"];

export function allocateComposition(total: number, focus: SpecialistFocus): DailyComposition {
  const ratios: Record<PlanCategory, number> = { weakness: 45, review: 25, reading: 20, extension: 10 };
  if (focus === "reading") {
    ratios.reading += 15;
    ratios.extension -= 5;
    ratios.weakness -= 10;
  } else if (focus !== "none") {
    ratios.weakness += 15;
    ratios.extension -= 10;
    ratios.weakness -= 5;
  }
  const result = Object.fromEntries(tieOrder.map((category) => [category, Math.floor(total * ratios[category] / 100)])) as DailyComposition;
  let remaining = total - Object.values(result).reduce((sum, value) => sum + value, 0);
  for (const category of [...tieOrder].sort((left, right) => (
    (total * ratios[right] % 100) - (total * ratios[left] % 100) || tieOrder.indexOf(left) - tieOrder.indexOf(right)
  ))) {
    if (remaining-- <= 0) break;
    result[category] += 1;
  }
  return result;
}
