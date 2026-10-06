import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { rewardEvents, trainingSessions, users } from "@/db/schema";
import { shanghaiDateKey } from "@/domain/time/shanghai-calendar";
import { createTestDatabase } from "@/test/test-db";
import ParentPage from "./page";

const state = vi.hoisted(() => ({ db: undefined as unknown }));
const requireRole = vi.hoisted(() => vi.fn());
const mockRefresh = vi.hoisted(() => vi.fn());

vi.mock("@/db/client", async (original) => ({
  ...(await original<typeof import("@/db/client")>()),
  getDatabase: () => state.db,
}));
vi.mock("@/lib/auth/current-user", () => ({ requireRole }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRefresh }) }));

function seedDb(admin: boolean) {
  const db = createTestDatabase();
  requireRole.mockResolvedValue({ id: "parent", role: "parent", displayName: "家长", isAdmin: admin });
  db.insert(users).values([
    { id: "parent", role: "parent", displayName: "家长", credentialHash: "h", createdAt: 1, loginName: "fam1", isAdmin: admin },
    { id: "c1", role: "child", displayName: "大女儿", credentialHash: "h", createdAt: 1, loginName: "kid1", parentId: "parent", grade: 6 },
    { id: "parent-other", role: "parent", displayName: "别家", credentialHash: "h", createdAt: 1, loginName: "famother" },
    { id: "c-other", role: "child", displayName: "别家孩子", credentialHash: "h", createdAt: 1, loginName: "kidother", parentId: "parent-other", grade: 2 },
  ]).run();
  state.db = db;
  return db as ReturnType<typeof createTestDatabase>;
}

beforeEach(() => {
  seedDb(true);
  mockRefresh.mockClear();
});

test("列出自己的孩子，不列出别家孩子/家长", async () => {
  render(await ParentPage());

  expect(screen.getByText("大女儿")).toBeInTheDocument();
  expect(screen.queryByText("别家孩子")).not.toBeInTheDocument();
  expect(screen.queryByText("别家")).not.toBeInTheDocument();
  expect(screen.getByText("6 年级")).toBeInTheDocument();
});

test("卡片含两个链接：学习情况与题库设置", async () => {
  render(await ParentPage());

  expect(screen.getByRole("link", { name: "学习情况" })).toHaveAttribute("href", "/parent/children/c1");
  expect(screen.getByRole("link", { name: "题库设置" })).toHaveAttribute("href", "/parent/children/c1/skills");
});

describe("今日状态", () => {
  test("无今日 session → 今天还没开始", async () => {
    render(await ParentPage());
    expect(screen.getByText("今天还没开始")).toBeInTheDocument();
  });

  test("进行中 session → 进行中", async () => {
    const db = state.db as ReturnType<typeof createTestDatabase>;
    db.insert(trainingSessions).values({
      id: "sess-in-progress",
      childId: "c1",
      sessionDate: shanghaiDateKey(),
      status: "in_progress",
      kind: "daily",
      startedAt: 1,
    }).run();

    render(await ParentPage());
    expect(screen.getByText("进行中")).toBeInTheDocument();
  });

  test("已完成 session → 已完成", async () => {
    const db = state.db as ReturnType<typeof createTestDatabase>;
    db.insert(trainingSessions).values({
      id: "sess-completed",
      childId: "c1",
      sessionDate: shanghaiDateKey(),
      status: "completed",
      kind: "daily",
      startedAt: 1,
      completedAt: 2,
    }).run();

    render(await ParentPage());
    expect(screen.getByText("已完成")).toBeInTheDocument();
  });
});

test("积分与徽章汇总，不计入别家孩子的奖励", async () => {
  const db = state.db as ReturnType<typeof createTestDatabase>;
  db.insert(rewardEvents).values([
    { id: "r1", childId: "c1", sourceKey: "src1", kind: "points", code: "daily", points: 5, occurredAt: 1 },
    { id: "r2", childId: "c1", sourceKey: "src2", kind: "points", code: "correct", points: 3, occurredAt: 2 },
    { id: "r3", childId: "c1", sourceKey: "src3", kind: "badge", code: "first_day", points: 0, occurredAt: 3 },
    { id: "r-other", childId: "c-other", sourceKey: "src-other", kind: "points", code: "daily", points: 50, occurredAt: 1 },
  ]).run();

  render(await ParentPage());

  expect(screen.getByText("8 积分")).toBeInTheDocument();
  expect(screen.getByText("1 枚徽章")).toBeInTheDocument();
});

test("添加孩子表单字段可见", async () => {
  render(await ParentPage());

  expect(screen.getByLabelText("孩子姓名")).toBeInTheDocument();
  expect(screen.getByLabelText("登录名")).toBeInTheDocument();
  expect(screen.getByLabelText("年级")).toBeInTheDocument();
  expect(screen.getByLabelText("登录密码")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "添加孩子" })).toBeInTheDocument();

  const gradeSelect = screen.getByLabelText("年级") as HTMLSelectElement;
  const options = Array.from(gradeSelect.options);
  expect(options.map((opt) => opt.value)).toEqual(["1", "2", "3", "4", "5", "6"]);
  expect(options.map((opt) => opt.textContent)).toEqual(["一年级", "二年级", "三年级", "四年级", "五年级", "六年级"]);
});

test("表单提交流程：成功创建孩子并刷新", async () => {
  const user = userEvent.setup();

  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 201,
    json: async () => ({ id: "c2" }),
  });
  vi.stubGlobal("fetch", fetchMock);

  try {
    render(await ParentPage());

    await user.type(screen.getByLabelText("孩子姓名"), "小二");
    await user.type(screen.getByLabelText("登录名"), "kid2");
    await user.selectOptions(screen.getByLabelText("年级"), "3");
    await user.type(screen.getByLabelText("登录密码"), "1357");
    await user.click(screen.getByRole("button", { name: "添加孩子" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/parent/children", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ "content-type": "application/json" }),
    }));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.displayName).toBe("小二");
    expect(body.loginName).toBe("kid2");
    expect(body.grade).toBe(3);
    expect(body.credential).toBe("1357");

    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
    expect(screen.getByText("孩子添加成功")).toBeInTheDocument();
  } finally {
    vi.unstubAllGlobals();
  }
});

test("409 冲突：显示错误信息，不刷新", async () => {
  const user = userEvent.setup();

  const fetchMock = vi.fn().mockResolvedValue({
    ok: false,
    status: 409,
    json: async () => ({ error: "登录名已被使用" }),
  });
  vi.stubGlobal("fetch", fetchMock);

  try {
    render(await ParentPage());

    await user.type(screen.getByLabelText("孩子姓名"), "小二");
    await user.type(screen.getByLabelText("登录名"), "kid2");
    await user.selectOptions(screen.getByLabelText("年级"), "3");
    await user.type(screen.getByLabelText("登录密码"), "1357");
    await user.click(screen.getByRole("button", { name: "添加孩子" }));

    await waitFor(() => expect(screen.getByText("登录名已被使用")).toBeInTheDocument());
    expect(mockRefresh).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});

describe("管理员链接区", () => {
  test("admin 显示三个链接", async () => {
    render(await ParentPage());

    const adminSection = screen.getByRole("region", { name: "全局管理" });
    expect(adminSection).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "进入题库" })).toHaveAttribute("href", "/parent/questions");
    expect(screen.getByRole("link", { name: "校历管理" })).toHaveAttribute("href", "/parent/calendar");
    expect(screen.getByRole("link", { name: "系统设置" })).toHaveAttribute("href", "/parent/settings");
  });

  test("非 admin 不显示全局管理区", async () => {
    seedDb(false);
    render(await ParentPage());

    expect(screen.queryByRole("region", { name: "全局管理" })).not.toBeInTheDocument();
  });
});

test("空状态：无孩子时显示引导与添加表单，无我的孩子区", async () => {
  const db = createTestDatabase();
  requireRole.mockResolvedValue({ id: "parent", role: "parent", displayName: "家长", isAdmin: true });
  db.insert(users).values({
    id: "parent", role: "parent", displayName: "家长", credentialHash: "h", createdAt: 1, loginName: "fam1", isAdmin: true,
  }).run();
  state.db = db;

  render(await ParentPage());

  expect(screen.getByText("还没有孩子账号")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "添加孩子" })).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "我的孩子" })).not.toBeInTheDocument();
});
