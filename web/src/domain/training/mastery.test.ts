import { deriveMasteryState, type MasteryEvidenceInput } from "./mastery";

function evidence(overrides: Partial<MasteryEvidenceInput> = {}): MasteryEvidenceInput {
  return {
    purpose: "learning", templateId: "template-1", structureTag: "structure-1",
    difficulty: 1, firstAttemptCorrect: true, independent: true,
    occurredOn: "2026-08-20", reviewIntervalDays: 0, ...overrides,
  };
}

function diagnosticRate(correctWeight: number, totalWeight: number, templates = 1) {
  const rows: MasteryEvidenceInput[] = [];
  for (let index = 0; index < correctWeight; index += 1) rows.push(evidence({
    purpose: "diagnostic", templateId: `correct-${index % templates}`,
    structureTag: `diagnostic-${index}`, firstAttemptCorrect: true,
  }));
  for (let index = correctWeight; index < totalWeight; index += 1) rows.push(evidence({
    purpose: "diagnostic", templateId: `wrong-${index}`,
    structureTag: `diagnostic-${index}`, firstAttemptCorrect: false,
  }));
  return rows;
}

test("maps exact diagnostic weighted-rate boundaries and requires two correct templates for basic", () => {
  expect(deriveMasteryState([])).toMatchObject({ status: "undiagnosed", reasonCode: "no_evidence" });
  expect(deriveMasteryState(diagnosticRate(49, 100)).status).toBe("needs_support");
  expect(deriveMasteryState(diagnosticRate(50, 100)).status).toBe("learning");
  expect(deriveMasteryState(diagnosticRate(79, 100)).status).toBe("learning");
  expect(deriveMasteryState(diagnosticRate(80, 100, 2)).status).toBe("basic");
  expect(deriveMasteryState(diagnosticRate(80, 100, 1)).status).toBe("learning");
});

test("weights diagnostic evidence by difficulty", () => {
  const rows = [
    evidence({ purpose: "diagnostic", difficulty: 4, firstAttemptCorrect: true, templateId: "a" }),
    evidence({ purpose: "diagnostic", difficulty: 4, firstAttemptCorrect: true, templateId: "b" }),
    evidence({ purpose: "diagnostic", difficulty: 1, firstAttemptCorrect: false, templateId: "c" }),
    evidence({ purpose: "diagnostic", difficulty: 1, firstAttemptCorrect: false, templateId: "d" }),
  ];
  expect(deriveMasteryState(rows)).toMatchObject({ status: "basic", reasonCode: "diagnostic_basic" });
});

test("moves support to learning only after independent correct evidence on two Shanghai dates", () => {
  const initial = diagnosticRate(0, 2);
  expect(deriveMasteryState([...initial,
    evidence({ occurredOn: "2026-08-21", templateId: "learn-1" }),
    evidence({ occurredOn: "2026-08-21", templateId: "learn-2" }),
  ]).status).toBe("needs_support");
  expect(deriveMasteryState([...initial,
    evidence({ occurredOn: "2026-08-21", templateId: "learn-1" }),
    evidence({ occurredOn: "2026-08-22", templateId: "learn-2" }),
  ])).toMatchObject({ status: "learning", reasonCode: "support_two_day_independent_correct" });
});

test("moves learning to basic at four of the latest five across two dates and templates", () => {
  const initial = diagnosticRate(1, 2);
  const recent = [
    evidence({ occurredOn: "2026-08-21", templateId: "a" }),
    evidence({ occurredOn: "2026-08-21", templateId: "b" }),
    evidence({ occurredOn: "2026-08-22", templateId: "c" }),
    evidence({ occurredOn: "2026-08-22", templateId: "d" }),
    evidence({ occurredOn: "2026-08-22", templateId: "e", firstAttemptCorrect: false }),
  ];
  expect(deriveMasteryState([...initial, ...recent]))
    .toMatchObject({ status: "basic", reasonCode: "learning_recent_five_basic" });
  expect(deriveMasteryState([...initial, ...recent.slice(0, 4),
    evidence({ occurredOn: "2026-08-22", templateId: "e", independent: false }),
  ]).status).toBe("learning");
});

test("stable requires a due review of at least seven days and another correct structure", () => {
  const initial = diagnosticRate(4, 5, 2);
  const alternate = evidence({ occurredOn: "2026-08-21", templateId: "learn", structureTag: "alternate" });
  const review = evidence({ purpose: "review", occurredOn: "2026-08-28", templateId: "review",
    structureTag: "review-structure", reviewIntervalDays: 7 });
  expect(deriveMasteryState([...initial, alternate, review]))
    .toMatchObject({ status: "stable", reasonCode: "basic_due_review_stable" });
  expect(deriveMasteryState([...initial, alternate, { ...review, reviewIntervalDays: 3 }]).status).toBe("basic");
  const oneStructureInitial = initial.map((row) => ({ ...row, structureTag: "same-structure" }));
  expect(deriveMasteryState([...oneStructureInitial, { ...review, structureTag: "same-structure" }]).status).toBe("basic");
  expect(deriveMasteryState([...initial, alternate]).status).toBe("basic");
});

test("a failed due review demotes stable to basic and basic to learning", () => {
  const initial = diagnosticRate(4, 5, 2);
  const alternate = evidence({ occurredOn: "2026-08-21", templateId: "learn", structureTag: "alternate" });
  const passedReview = evidence({ purpose: "review", occurredOn: "2026-08-28", templateId: "review-1",
    structureTag: "review-structure", reviewIntervalDays: 7 });
  const failedReview = evidence({ purpose: "review", occurredOn: "2026-09-11", templateId: "review-2",
    structureTag: "review-structure-2", reviewIntervalDays: 14, firstAttemptCorrect: false });
  expect(deriveMasteryState([...initial, alternate, passedReview, failedReview]))
    .toMatchObject({ status: "basic", reasonCode: "failed_due_review_stable_to_basic" });
  expect(deriveMasteryState([...initial, failedReview]))
    .toMatchObject({ status: "learning", reasonCode: "failed_due_review_basic_to_learning" });
});

test("two consecutive failed due reviews on different Shanghai dates need support", () => {
  const initial = diagnosticRate(4, 5, 2);
  const failed = (occurredOn: string, templateId: string) => evidence({ purpose: "review", occurredOn,
    templateId, reviewIntervalDays: 7, firstAttemptCorrect: false });
  expect(deriveMasteryState([...initial, failed("2026-08-27", "r1"), failed("2026-08-27", "r2")]).status).toBe("learning");
  expect(deriveMasteryState([...initial, failed("2026-08-27", "r1"), failed("2026-09-03", "r2")]))
    .toMatchObject({ status: "needs_support", reasonCode: "two_day_failed_due_reviews" });
});

test("hinted or corrected answers never count as independent correct evidence", () => {
  const initial = diagnosticRate(0, 2);
  expect(deriveMasteryState([...initial,
    evidence({ occurredOn: "2026-08-21", independent: false }),
    evidence({ occurredOn: "2026-08-22", independent: false }),
  ])).toMatchObject({ status: "needs_support", firstAttemptCorrectCount: 2, independentCorrectCount: 0 });
});

test("demotion starts a fresh promotion window", () => {
  const initial = diagnosticRate(4, 5, 2);
  const passed = evidence({ purpose: "review", occurredOn: "2026-08-20", templateId: "pass",
    structureTag: "pass-structure", reviewIntervalDays: 7 });
  const failed = (occurredOn: string, templateId: string) => evidence({ purpose: "review", occurredOn,
    templateId, reviewIntervalDays: 7, firstAttemptCorrect: false });
  const demoted = [...initial, passed, failed("2026-08-27", "fail-1"), failed("2026-09-03", "fail-2")];
  expect(deriveMasteryState([...demoted, evidence({ occurredOn: "2026-09-04", templateId: "new-1" })]).status)
    .toBe("needs_support");
  expect(deriveMasteryState([...demoted,
    evidence({ occurredOn: "2026-09-04", templateId: "new-1" }),
    evidence({ occurredOn: "2026-09-05", templateId: "new-2" }),
  ]).status).toBe("learning");
});
