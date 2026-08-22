import {
  deriveMasteryState,
  masteryReasonDescriptions,
  type MasteryEvidenceInput,
  type MasteryReasonCode,
} from "./mastery";

function evidence(overrides: Partial<MasteryEvidenceInput> = {}): MasteryEvidenceInput {
  return {
    purpose: "learning", templateId: "template-1", structureTag: "structure-1",
    difficulty: 1, firstAttemptCorrect: true, independent: true,
    occurredOn: "2026-08-20", occurredAt: 1, id: "evidence-1", hintLevel: 0,
    diagnosticRunId: null, diagnosticCompletedOn: null, diagnosticCompletedAt: null,
    reviewIntervalDays: 0, ...overrides,
  };
}

function diagnosticRate(correctWeight: number, totalWeight: number, templates = 1) {
  const rows: MasteryEvidenceInput[] = [];
  for (let index = 0; index < correctWeight; index += 1) rows.push(evidence({
    id: `diagnostic-correct-${index}`, occurredAt: index + 1,
    purpose: "diagnostic", templateId: `correct-${index % templates}`,
    structureTag: `diagnostic-${index}`, firstAttemptCorrect: true,
    diagnosticRunId: "diagnostic-run", diagnosticCompletedOn: "2026-08-20", diagnosticCompletedAt: 1_000,
  }));
  for (let index = correctWeight; index < totalWeight; index += 1) rows.push(evidence({
    id: `diagnostic-wrong-${index}`, occurredAt: index + 1,
    purpose: "diagnostic", templateId: `wrong-${index}`,
    structureTag: `diagnostic-${index}`, firstAttemptCorrect: false,
    diagnosticRunId: "diagnostic-run", diagnosticCompletedOn: "2026-08-20", diagnosticCompletedAt: 1_000,
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

test("orders diagnosis batches at completion so a successful retest resets earlier review failures", () => {
  const first = diagnosticRate(4, 5, 2).map((row, index) => ({
    ...row, id: `first-${index}`, occurredAt: 10 + index,
    diagnosticRunId: "run-1", diagnosticCompletedOn: "2026-08-20", diagnosticCompletedAt: 100,
  }));
  const failed = evidence({
    id: "failed-review", purpose: "review", occurredOn: "2026-08-27", occurredAt: 200,
    reviewIntervalDays: 7, firstAttemptCorrect: false,
  });
  const retest = diagnosticRate(5, 5, 2).map((row, index) => ({
    ...row, id: `retest-${index}`, occurredOn: "2026-08-21", occurredAt: 300 + index,
    diagnosticRunId: "run-2", diagnosticCompletedOn: "2026-09-01", diagnosticCompletedAt: 400,
  }));
  expect(deriveMasteryState([failed, ...retest.toReversed(), ...first.toReversed()]))
    .toMatchObject({
      status: "basic", reasonCode: "diagnostic_basic",
      lastAppliedAt: 400, evidenceCursor: "retest-4",
    });
});

test("uses occurred date, timestamp, then id as the deterministic event tie-break", () => {
  const diagnosis = diagnosticRate(4, 5, 2).map((row, index) => ({
    ...row, id: `diagnostic-${index}`, diagnosticRunId: "m-run",
    diagnosticCompletedOn: "2026-08-20", diagnosticCompletedAt: 100,
  }));
  const review = evidence({
    id: "z-review", purpose: "review", occurredOn: "2026-08-20", occurredAt: 100,
    reviewIntervalDays: 7, firstAttemptCorrect: false,
  });
  expect(deriveMasteryState([review, ...diagnosis])).toMatchObject({
    status: "learning", lastAppliedAt: 100, evidenceCursor: "z-review",
  });
  expect(deriveMasteryState([{ ...review, id: "a-review" }, ...diagnosis])).toMatchObject({
    status: "basic", lastAppliedAt: 100, evidenceCursor: "diagnostic-4",
  });
});

test("does not turn unknown legacy diagnostic hint telemetry into incorrect evidence", () => {
  const unknown = diagnosticRate(5, 5, 2).map((row) => ({
    ...row, hintLevel: null, independent: false,
  }));
  expect(deriveMasteryState(unknown, "basic"))
    .toMatchObject({ status: "basic", reasonCode: "diagnostic_group_unknown" });
});

test("recent five allows level-one help but rejects level two and reports exact hold reasons", () => {
  const initial = diagnosticRate(1, 2);
  const recent = [0, 1, 2, 3, 4].map((index) => evidence({
    id: `recent-${index}`, occurredAt: 10 + index,
    occurredOn: index < 2 ? "2026-08-21" : "2026-08-22",
    templateId: `template-${index}`, hintLevel: index === 0 ? 1 : 0,
    independent: index !== 0,
  }));
  expect(deriveMasteryState([...initial, ...recent])).toMatchObject({
    status: "basic", reasonCode: "learning_recent_five_basic",
    supportingEvidenceIds: ["recent-0", "recent-1", "recent-2", "recent-3", "recent-4"],
  });
  expect(deriveMasteryState([...initial, ...recent.map((row, index) => (
    index === 0 ? { ...row, hintLevel: 2 as const } : row
  ))])).toMatchObject({ status: "learning", reasonCode: "recent_five_high_or_unknown_hint" });
  expect(deriveMasteryState([...initial, ...recent.map((row, index) => (
    index < 2 ? { ...row, firstAttemptCorrect: false } : row
  ))])).toMatchObject({ status: "learning", reasonCode: "recent_five_below_basic" });
  expect(deriveMasteryState([...initial, ...recent.slice(0, 4)]))
    .toMatchObject({ status: "learning", reasonCode: "recent_five_insufficient_count" });
});

test("keeps a complete Chinese explanation for every reducer reason code", () => {
  const reasonCodes: MasteryReasonCode[] = [
    "no_evidence", "diagnostic_group_unknown", "no_diagnostic_evidence",
    "preserved_status_without_diagnostic_telemetry", "diagnostic_needs_support",
    "diagnostic_learning", "diagnostic_basic", "recent_five_insufficient_count",
    "recent_five_below_basic", "recent_five_high_or_unknown_hint",
    "recent_five_single_day", "recent_five_single_template",
    "support_two_day_independent_correct", "learning_recent_five_basic",
    "basic_due_review_stable", "failed_due_review_stable_to_basic",
    "failed_due_review_basic_to_learning", "two_day_failed_due_reviews",
  ];

  expect(Object.keys(masteryReasonDescriptions).sort()).toEqual(reasonCodes.sort());
  expect(masteryReasonDescriptions.learning_recent_five_basic)
    .toContain("最近 5 次首答至少 4 次正确");
  expect(masteryReasonDescriptions.diagnostic_group_unknown).toContain("诊断证据");
  expect(masteryReasonDescriptions.no_diagnostic_evidence).toContain("没有可用诊断");
  expect(masteryReasonDescriptions.preserved_status_without_diagnostic_telemetry).toContain("保留原状态");
});

test("keeps no-diagnosis practice rows as the exact basis for waiting", () => {
  expect(deriveMasteryState([evidence({ id: "practice-only" })])).toMatchObject({
    status: "undiagnosed",
    reasonCode: "no_diagnostic_evidence",
    supportingEvidenceIds: ["practice-only"],
  });
});

test("links state changes to the evidence that actually triggered them", () => {
  const diagnosis = diagnosticRate(4, 5, 2);
  expect(deriveMasteryState(diagnosis)).toMatchObject({
    reasonCode: "diagnostic_basic",
    supportingEvidenceIds: diagnosis.map((row) => row.id),
    evidenceCursor: diagnosis.at(-1)!.id,
  });

  const alternate = evidence({ id: "alternate", occurredOn: "2026-08-21", structureTag: "alternate" });
  const review = evidence({ id: "review-trigger", purpose: "review", occurredOn: "2026-08-28",
    structureTag: "review", reviewIntervalDays: 7 });
  expect(deriveMasteryState([...diagnosis, alternate, review])).toMatchObject({
    reasonCode: "basic_due_review_stable",
    supportingEvidenceIds: ["alternate", "review-trigger"],
    evidenceCursor: "review-trigger",
  });

  const failedAgain = evidence({ id: "failed-review", purpose: "review", occurredOn: "2026-09-11",
    reviewIntervalDays: 14, firstAttemptCorrect: false });
  expect(deriveMasteryState([...diagnosis, alternate, review, failedAgain])).toMatchObject({
    reasonCode: "failed_due_review_stable_to_basic",
    supportingEvidenceIds: ["failed-review"],
  });
});

test("stable cannot reuse a different structure from before its last demotion", () => {
  const initial = diagnosticRate(4, 5, 2);
  const alternate = evidence({ id: "old-alternate", occurredOn: "2026-08-21", occurredAt: 10, structureTag: "alternate" });
  const pass = evidence({ id: "first-pass", purpose: "review", occurredAt: 20,
    occurredOn: "2026-08-27", structureTag: "review", reviewIntervalDays: 7 });
  const fail = evidence({ id: "fail", purpose: "review", occurredAt: 30,
    occurredOn: "2026-09-03", structureTag: "failed", reviewIntervalDays: 7, firstAttemptCorrect: false });
  const secondPass = evidence({ id: "second-pass", purpose: "review", occurredAt: 40,
    occurredOn: "2026-09-10", structureTag: "new-review", reviewIntervalDays: 7 });
  expect(deriveMasteryState([...initial, alternate, pass, fail, secondPass]))
    .toMatchObject({ status: "basic" });
});

test("weights diagnostic evidence by difficulty", () => {
  const rows = [
    evidence({ purpose: "diagnostic", difficulty: 4, firstAttemptCorrect: true, templateId: "a",
      diagnosticRunId: "weighted", diagnosticCompletedOn: "2026-08-20", diagnosticCompletedAt: 10 }),
    evidence({ purpose: "diagnostic", difficulty: 4, firstAttemptCorrect: true, templateId: "b",
      diagnosticRunId: "weighted", diagnosticCompletedOn: "2026-08-20", diagnosticCompletedAt: 10 }),
    evidence({ purpose: "diagnostic", difficulty: 1, firstAttemptCorrect: false, templateId: "c",
      diagnosticRunId: "weighted", diagnosticCompletedOn: "2026-08-20", diagnosticCompletedAt: 10 }),
    evidence({ purpose: "diagnostic", difficulty: 1, firstAttemptCorrect: false, templateId: "d",
      diagnosticRunId: "weighted", diagnosticCompletedOn: "2026-08-20", diagnosticCompletedAt: 10 }),
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
    evidence({ occurredOn: "2026-08-22", templateId: "e", independent: false, hintLevel: 2 }),
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
