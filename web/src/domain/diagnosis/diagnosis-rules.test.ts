import { describe, expect, it } from "vitest";
import { phase2Catalog } from "@/content/phase2-catalog";
import { deriveInitialReport } from "./derive-initial-report";
import { nextDifficulty, selectNextDiagnosticQuestion } from "./select-next-question";
import type {
  DiagnosticAnswer,
  DiagnosticTemplateSummary,
  Difficulty,
} from "./types";

const catalog: DiagnosticTemplateSummary[] = phase2Catalog.map((template) => ({
  templateId: template.id,
  skillId: `skill-${template.skillCode}`,
  domain: template.domain,
  difficulty: template.difficulty,
}));

function answerFor(
  selection: NonNullable<ReturnType<typeof selectNextDiagnosticQuestion>>,
  correct = false,
): DiagnosticAnswer {
  const template = catalog.find((candidate) => candidate.templateId === selection.templateId)!;
  return {
    templateId: template.templateId,
    skillId: template.skillId,
    domain: template.domain,
    difficulty: selection.difficulty,
    correct,
    independent: correct,
  };
}

function selectPart(partNumber: 1 | 2 | 3, runSeed: string): {
  selections: NonNullable<ReturnType<typeof selectNextDiagnosticQuestion>>[];
  answers: DiagnosticAnswer[];
} {
  const answers: DiagnosticAnswer[] = [];
  const selections: NonNullable<ReturnType<typeof selectNextDiagnosticQuestion>>[] = [];

  for (let slot = 0; slot < 15; slot += 1) {
    const selection = selectNextDiagnosticQuestion({
      catalog, answers, runSeed, partNumber, completedInPart: slot,
    });
    expect(selection).not.toBeNull();
    selections.push(selection!);
    answers.push(answerFor(selection!));
  }

  return { selections, answers };
}

describe("diagnosis difficulty rules", () => {
  it("starts at 2, holds after one success, raises after two, and lowers after an error", () => {
    expect(nextDifficulty([])).toBe(2);
    expect(nextDifficulty([{ correct: true, independent: true, difficulty: 2 }])).toBe(2);
    expect(nextDifficulty([
      { correct: true, independent: true, difficulty: 2 },
      { correct: true, independent: true, difficulty: 2 },
    ])).toBe(3);
    expect(nextDifficulty([{ correct: false, independent: true, difficulty: 2 }])).toBe(1);
  });

  it("moves only one level and stays inside difficulty 1 through 4", () => {
    expect(nextDifficulty([{ correct: false, independent: true, difficulty: 1 }])).toBe(1);
    expect(nextDifficulty([
      { correct: true, independent: true, difficulty: 4 },
      { correct: true, independent: true, difficulty: 4 },
    ])).toBe(4);
    expect(nextDifficulty([
      { correct: false, independent: true, difficulty: 4 },
    ])).toBe(3);
    expect(nextDifficulty([
      { correct: true, independent: false, difficulty: 3 },
      { correct: true, independent: true, difficulty: 3 },
    ])).toBe(3);
  });
});

describe("diagnosis selection", () => {
  it("selects 15 unique templates in a part", () => {
    const { selections } = selectPart(1, "run-1");
    expect(new Set(selections.map((selection) => selection.templateId)).size).toBe(15);
  });

  it("never repeats a template across all three parts of one run", () => {
    const answers: DiagnosticAnswer[] = [];
    const templateIds: string[] = [];

    for (const partNumber of [1, 2, 3] as const) {
      for (let slot = 0; slot < 15; slot += 1) {
        const selection = selectNextDiagnosticQuestion({
          catalog, answers, runSeed: "full-run", partNumber, completedInPart: slot,
        });
        expect(selection).not.toBeNull();
        templateIds.push(selection!.templateId);
        answers.push(answerFor(selection!));
      }
    }

    expect(new Set(templateIds).size).toBe(45);
  });

  it("is repeatable for one run seed and uses another seed only for variants", () => {
    const first = selectPart(2, "run-1").selections;
    const repeated = selectPart(2, "run-1").selections;
    const anotherRun = selectPart(2, "run-2").selections;

    expect(repeated).toEqual(first);
    expect(anotherRun.map(({ templateId, targetDifficulty, difficulty, reason }) => (
      { templateId, targetDifficulty, difficulty, reason }
    ))).toEqual(first.map(({ templateId, targetDifficulty, difficulty, reason }) => (
      { templateId, targetDifficulty, difficulty, reason }
    )));
    expect(anotherRun.map((selection) => selection.variantSeed))
      .not.toEqual(first.map((selection) => selection.variantSeed));
  });

  it("uses the fixed domain rotation for every part", () => {
    const domains = (partNumber: 1 | 2 | 3) => selectPart(partNumber, "coverage-run").selections
      .map((selection) => catalog.find((item) => item.templateId === selection.templateId)!.domain);

    expect(new Set(domains(1))).toEqual(new Set(["number_operations"]));
    expect(domains(2)).toEqual(Array.from({ length: 15 }, (_, index) => (
      ["equation_algebra", "application_modeling", "thinking_habits"] as const
    )[index % 3]));
    expect(domains(3)).toEqual(Array.from({ length: 15 }, (_, index) => (
      ["geometry_space", "data_statistics", "application_modeling", "thinking_habits"] as const
    )[index % 4]));
  });

  it("sorts candidates by difficulty distance, skill evidence count, then template id", () => {
    const smallCatalog: DiagnosticTemplateSummary[] = [
      { templateId: "z-near-used-skill", skillId: "skill-used", domain: "number_operations", difficulty: 2 },
      { templateId: "b-near-fresh-skill", skillId: "skill-fresh", domain: "number_operations", difficulty: 2 },
      { templateId: "a-far-fresh-skill", skillId: "skill-fresh", domain: "number_operations", difficulty: 3 },
      { templateId: "a-near-fresh-skill", skillId: "skill-other", domain: "number_operations", difficulty: 2 },
    ];
    const answers: DiagnosticAnswer[] = [{
      templateId: "already-used", skillId: "skill-used", domain: "number_operations",
      difficulty: 2, correct: true, independent: false,
    }];

    expect(selectNextDiagnosticQuestion({
      catalog: smallCatalog, answers, runSeed: "sort", partNumber: 1, completedInPart: 1,
    })?.templateId).toBe("a-near-fresh-skill");
  });

  it("returns null when the rotated domain has no unused candidate", () => {
    expect(selectNextDiagnosticQuestion({
      catalog: [], answers: [], runSeed: "empty", partNumber: 1, completedInPart: 0,
    })).toBeNull();
  });

  it("reports target difficulty separately when all-wrong answers exhaust exact low-level templates", () => {
    const answers: DiagnosticAnswer[] = [];
    const selections: NonNullable<ReturnType<typeof selectNextDiagnosticQuestion>>[] = [];

    for (let slot = 0; slot < 15; slot += 1) {
      const selection = selectNextDiagnosticQuestion({
        catalog, answers, runSeed: "all-wrong", partNumber: 1, completedInPart: slot,
      })!;
      selections.push(selection);
      answers.push(answerFor(selection, false));
    }
    expect(selections[0]).toMatchObject({ targetDifficulty: 2, difficulty: 2, reason: "part_anchor" });
    expect(selections.map((selection) => selection.targetDifficulty))
      .toEqual([2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect(selections.map((selection) => selection.difficulty))
      .toEqual([2, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3]);
    expect(selections.slice(1).every((selection) => selection.reason === "lower_after_error"))
      .toBe(true);
  });

  it("caps an all-correct target at 4 while transparently falling back to the nearest catalog level", () => {
    const answers: DiagnosticAnswer[] = [];
    const selections: NonNullable<ReturnType<typeof selectNextDiagnosticQuestion>>[] = [];

    for (let slot = 0; slot < 15; slot += 1) {
      const selection = selectNextDiagnosticQuestion({
        catalog, answers, runSeed: "all-correct", partNumber: 1, completedInPart: slot,
      })!;
      selections.push(selection);
      answers.push(answerFor(selection, true));
    }
    expect(selections.map((selection) => selection.targetDifficulty))
      .toEqual([2, 2, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 3, 3, 3]);
    expect(selections.map((selection) => selection.difficulty))
      .toEqual([2, 2, 3, 4, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2]);
    expect(selections.slice(2).every((selection) => selection.reason === "raise_after_two"))
      .toBe(true);
  });

  it("uses explicit current-part progress for rotation and recent movement evidence", () => {
    const oldApplicationAnswer: DiagnosticAnswer = {
      templateId: "app-price-01", skillId: "skill-price-model", domain: "application_modeling",
      difficulty: 2, correct: false, independent: true,
    };
    const currentPartAnswers: DiagnosticAnswer[] = [
      { templateId: "geo-angle-01", skillId: "skill-angle", domain: "geometry_space", difficulty: 2, correct: true, independent: true },
      { templateId: "data-table-01", skillId: "skill-data-table", domain: "data_statistics", difficulty: 2, correct: true, independent: true },
    ];

    const selection = selectNextDiagnosticQuestion({
      catalog,
      answers: [oldApplicationAnswer, ...currentPartAnswers],
      runSeed: "part-boundary",
      partNumber: 3,
      completedInPart: 2,
    });

    expect(selection).toMatchObject({ targetDifficulty: 2, reason: "part_anchor" });
    expect(catalog.find((item) => item.templateId === selection?.templateId)?.domain)
      .toBe("application_modeling");
  });

  it("returns null instead of creating a sixteenth item in a completed part", () => {
    const { answers } = selectPart(1, "complete-part");
    expect(selectNextDiagnosticQuestion({
      catalog, answers, runSeed: "complete-part", partNumber: 1, completedInPart: 15,
    })).toBeNull();
  });
});

function evidenceForRate(
  correctWeight: number,
  totalWeight: number,
  distinctCorrectTemplates = 1,
): DiagnosticAnswer[] {
  const evidence: DiagnosticAnswer[] = [];
  let remainingCorrect = correctWeight;

  for (let index = 0; index < totalWeight; index += 1) {
    const correct = remainingCorrect > 0;
    if (correct) remainingCorrect -= 1;
    evidence.push({
      templateId: correct ? `correct-${index % distinctCorrectTemplates}` : `wrong-${index}`,
      skillId: "skill-rate",
      domain: "number_operations",
      difficulty: 1 as Difficulty,
      correct,
      independent: correct,
    });
  }
  return evidence;
}

describe("initial diagnosis report", () => {
  it.each([
    { evidence: evidenceForRate(49, 100), status: "needs_support", rate: 49 },
    { evidence: evidenceForRate(50, 100), status: "learning", rate: 50 },
    { evidence: evidenceForRate(79, 100), status: "learning", rate: 79 },
    { evidence: evidenceForRate(80, 100, 2), status: "basic", rate: 80 },
  ] as const)("maps weighted rate $rate to $status", ({ evidence, status, rate }) => {
    const report = deriveInitialReport(evidence);
    expect(report.skills[0]).toMatchObject({ status, weightedRate: rate });
    expect(report.domains[0]).toMatchObject({ status, weightedRate: rate });
  });

  it("requires two independently correct templates before reporting basic", () => {
    const report = deriveInitialReport(evidenceForRate(80, 100, 1));
    expect(report.skills[0]).toMatchObject({
      status: "learning",
      distinctIndependentCorrectTemplates: 1,
    });
  });

  it("uses difficulty weights and excludes prompted correct work from the numerator", () => {
    const report = deriveInitialReport([
      { templateId: "hard", skillId: "skill-weight", domain: "equation_algebra", difficulty: 4, correct: true, independent: true },
      { templateId: "prompted", skillId: "skill-weight", domain: "equation_algebra", difficulty: 1, correct: true, independent: false },
    ]);
    expect(report.skills[0]).toMatchObject({ weightedRate: 80, status: "learning", evidenceCount: 2 });
  });
});
