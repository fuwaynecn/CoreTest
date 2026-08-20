import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ErrorEvidenceView, ErrorSummaryView } from "@/services/parent/get-learning-state";
import { ErrorSummary } from "./error-summary";

const view: { summary: ErrorSummaryView; errors: ErrorEvidenceView[] } = {
  summary: { knowledge: 0, habit: 1, unknown: 0 },
  errors: [{
    rootObservationId: "observation-1",
    sessionItemId: "item-1",
    stem: "每盒彩笔 7.5 元，买 1 盒需要付多少钱？请写单位。",
    firstAnswer: "7.5",
    correctedAnswer: "7.5 元",
    skillName: "读题与单位",
    occurredOn: "2026-08-23",
    activeDurationMs: 42_000,
    effectiveCause: "missing_unit" as const,
    effectiveCategory: "habit" as const,
    effectiveSource: "child" as const,
    history: [
      { id: "observation-1", source: "system" as const, value: "missing_unit", previousValue: null, actorName: null, observedAt: Date.parse("2026-08-23T09:00:00+08:00") },
      { id: "observation-2", source: "child" as const, value: "missed_condition_or_unit", previousValue: "missing_unit", actorName: "孩子", observedAt: Date.parse("2026-08-23T09:02:00+08:00") },
    ],
  }],
};

afterEach(() => vi.restoreAllMocks());

test("submits a parent correction and refreshes the audited read model", async () => {
  const refresh = vi.fn();
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
    observation: { id: "observation-3" },
  }), { status: 200 }));
  render(<ErrorSummary {...view} refresh={refresh} />);

  const evidence = screen.getByRole("article", { name: /单位题的错因证据/ });
  expect(within(evidence).getByText("孩子自评：漏了条件或单位")).toBeInTheDocument();
  expect(within(evidence).getByText("活跃作答约 42 秒（仅作上下文）")).toBeInTheDocument();
  await userEvent.selectOptions(within(evidence).getByLabelText("修正当前错因"), "calculation");
  await userEvent.click(within(evidence).getByRole("button", { name: "保存家长修正" }));

  expect(fetchSpy).toHaveBeenCalledWith("/api/parent/error-observations/observation-1", expect.objectContaining({
    method: "PATCH",
    body: JSON.stringify({ cause: "calculation" }),
  }));
  expect(await within(evidence).findByRole("status")).toHaveTextContent("已保存，正在更新证据链");
  expect(refresh).toHaveBeenCalledTimes(1);
});

test("keeps the original audit visible when a correction fails", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
    error: { message: "没有找到这个孩子的错因记录" },
  }), { status: 404 }));
  render(<ErrorSummary {...view} refresh={() => undefined} />);

  await userEvent.click(screen.getByRole("button", { name: "保存家长修正" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("没有找到这个孩子的错因记录");
  expect(screen.getByText("系统候选：漏单位或单位不符")).toBeInTheDocument();
});
