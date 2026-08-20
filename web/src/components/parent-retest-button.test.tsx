import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ParentRetestButton } from "./parent-retest-button";

afterEach(() => vi.restoreAllMocks());

test("starts the expected diagnosis version once and refreshes on success", async () => {
  const refresh = vi.fn();
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
    diagnosis: { runId: "run-v2", version: 2, status: "in_progress" },
  }), { status: 201 }));
  render(<ParentRetestButton expectedCompletedVersion={1} refresh={refresh} />);

  await userEvent.dblClick(screen.getByRole("button", { name: "发起第 2 版诊断" }));

  expect(fetchSpy).toHaveBeenCalledTimes(1);
  expect(JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)).toEqual({ expectedCompletedVersion: 1 });
  expect(refresh).toHaveBeenCalledTimes(1);
});

test("shows the structured conflict without pretending a retest started", async () => {
  const refresh = vi.fn();
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
    error: { code: "retest_already_active", message: "已有复测进行中", currentVersion: 2 },
  }), { status: 409 }));
  render(<ParentRetestButton expectedCompletedVersion={1} refresh={refresh} />);

  await userEvent.click(screen.getByRole("button", { name: "发起第 2 版诊断" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("已有复测进行中");
  expect(refresh).not.toHaveBeenCalled();
});
