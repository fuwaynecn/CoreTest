import { expect, test } from "vitest";
import { phase2Catalog } from "./phase2-catalog";
import { instantiateTemplateAtIndex, variantPeriod } from "@/domain/questions/instantiate-template";
import { validateCatalog } from "@/domain/questions/template-schema";
import { questionSimilarityKey } from "@/services/questions/question-bank-refresh";

const MIN_STEMS_PER_SKILL = 6;
const MIN_TOTAL_STEMS = 200;

// The bank keeps only one active instance per similarity key, and a key is the skill id plus the stem
// with digits and punctuation stripped. Growing a template's numeric variables therefore adds rows
// without adding supply, so the gate counts normalized shapes rather than catalog entries.
function distinctStemsBySkill(): Map<string, Set<string>> {
  const bySkill = new Map<string, Set<string>>();

  for (const template of phase2Catalog) {
    const skillId = `skill-${template.skillCode}`;
    const stems = bySkill.get(skillId) ?? new Set<string>();
    for (let index = 0; index < variantPeriod(template); index += 1) {
      const instance = instantiateTemplateAtIndex(template, index, `supply:${template.id}:${index}`);
      stems.add(questionSimilarityKey(skillId, instance.stem));
    }
    bySkill.set(skillId, stems);
  }

  return bySkill;
}

test("the reviewed catalog is structurally valid", () => {
  expect(validateCatalog(phase2Catalog)).toEqual([]);
});

test("every skill code offers at least six distinct question shapes", () => {
  const deficits = [...distinctStemsBySkill().entries()]
    .map(([skillId, stems]) => ({ skillId, have: stems.size, need: MIN_STEMS_PER_SKILL - stems.size }))
    .filter(({ need }) => need > 0)
    .sort((left, right) => right.need - left.need);

  expect(deficits).toEqual([]);
});

test("the catalog offers at least two hundred distinct question shapes", () => {
  const shapes = new Set([...distinctStemsBySkill().values()].flatMap((stems) => [...stems]));

  expect(shapes.size).toBeGreaterThanOrEqual(MIN_TOTAL_STEMS);
});
