import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import ChildManageForm from "./child-manage-form";

afterEach(() => vi.restoreAllMocks());

describe("ChildManageForm", () => {
  test("prefills display name and grade and saves changes via PATCH", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      id: "child-1", displayName: "大宝", loginName: "kid1", grade: 5,
    }), { status: 200 }));
    const refresh = vi.fn();

    render(<ChildManageForm childId="child-1" initial={{ displayName: "大宝", grade: 6 }} refresh={refresh} />);

    const info = screen.getByRole("group", { name: "修改资料" });
    expect(within(info).getByLabelText("孩子姓名")).toHaveValue("大宝");
    expect(within(info).getByLabelText("年级")).toHaveValue("6");

    await userEvent.type(within(info).getByLabelText("孩子姓名"), "2");
    await userEvent.selectOptions(within(info).getByLabelText("年级"), "5");
    await userEvent.click(within(info).getByRole("button", { name: "保存资料" }));

    expect(fetchSpy).toHaveBeenCalledWith("/api/parent/children/child-1", expect.objectContaining({
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "大宝2", grade: 5 }),
    }));
    expect(await within(info).findByRole("status")).toHaveTextContent("资料已保存");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  test("shows the server error when saving info fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "输入无效" }), { status: 400 }));
    render(<ChildManageForm childId="child-1" initial={{ displayName: "大宝", grade: 6 }} refresh={vi.fn()} />);

    const info = screen.getByRole("group", { name: "修改资料" });
    await userEvent.click(within(info).getByRole("button", { name: "保存资料" }));

    expect(await within(info).findByRole("alert")).toHaveTextContent("输入无效");
  });

  test("resets the child password via POST and refreshes", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const refresh = vi.fn();

    render(<ChildManageForm childId="child-1" initial={{ displayName: "大宝", grade: 6 }} refresh={refresh} />);

    const password = screen.getByRole("group", { name: "重置密码" });
    await userEvent.type(within(password).getByLabelText("新密码"), "abcd-5678");
    await userEvent.click(within(password).getByRole("button", { name: "重置密码" }));

    expect(fetchSpy).toHaveBeenCalledWith("/api/parent/children/child-1/reset-password", expect.objectContaining({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ credential: "abcd-5678" }),
    }));
    expect(await within(password).findByRole("status")).toHaveTextContent("密码已重置");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  test("shows the server error when resetting the password fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "输入无效" }), { status: 400 }));
    render(<ChildManageForm childId="child-1" initial={{ displayName: "大宝", grade: 6 }} refresh={vi.fn()} />);

    const password = screen.getByRole("group", { name: "重置密码" });
    await userEvent.type(within(password).getByLabelText("新密码"), "abcd-5678");
    await userEvent.click(within(password).getByRole("button", { name: "重置密码" }));

    expect(await within(password).findByRole("alert")).toHaveTextContent("输入无效");
  });
});