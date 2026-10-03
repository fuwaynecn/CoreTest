import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AiProviderConfigView } from "@/services/parent/ai-provider-config";
import { AiProviderConfigForm } from "./ai-provider-config-form";

const initialViews: AiProviderConfigView[] = [
  {
    provider: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5",
    enabled: true,
    hasApiKey: true,
    apiKeyMasked: "••••••-key",
    updatedAt: 1,
  },
  {
    provider: "deepseek",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-chat",
    enabled: false,
    hasApiKey: false,
    apiKeyMasked: "",
    updatedAt: null,
  },
];

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

async function renderExpanded() {
  const user = userEvent.setup();
  render(<AiProviderConfigForm initial={initialViews} />);
  await user.click(screen.getByText("AI 服务配置"));
  return user;
}

test("keeps provider controls collapsed until the parent expands them", async () => {
  const user = userEvent.setup();
  render(<AiProviderConfigForm initial={initialViews} />);
  const disclosure = screen.getByText("AI 服务配置").closest("details");
  expect(disclosure).not.toHaveAttribute("open");

  await user.click(screen.getByText("AI 服务配置"));

  expect(disclosure).toHaveAttribute("open");
  expect(screen.getByRole("group", { name: "OpenAI" })).toBeInTheDocument();
  expect(screen.getByRole("group", { name: "DeepSeek" })).toBeInTheDocument();
  expect(screen.getByDisplayValue("gpt-5")).toBeInTheDocument();
  expect(screen.getByText("••••••-key")).toBeInTheDocument();
  expect(screen.getByText("测试连接会向所选服务商发送固定的连接测试消息，不会发送孩子作答数据。")).toBeInTheDocument();
});

test("submits a replacement key without pre-filling the old key", async () => {
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
    provider: { ...initialViews[0], hasApiKey: true, apiKeyMasked: "••••••new" },
  }));
  vi.stubGlobal("fetch", fetchMock);
  const user = await renderExpanded();
  const keyInput = screen.getByLabelText("OpenAI API Key（更换时填写）");
  expect(keyInput).toHaveValue("");
  await user.type(keyInput, "new-key");
  await user.click(screen.getByRole("button", { name: "保存 OpenAI" }));
  expect(fetchMock).toHaveBeenCalledWith("/api/parent/ai-config", expect.objectContaining({
    body: expect.stringContaining("\"apiKey\":\"new-key\""),
  }));
  expect(keyInput).toHaveValue("");
  expect(await screen.findByText("OpenAI 配置已保存")).toBeInTheDocument();
});

test("clears the replacement key after a non-OK response", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, { status: 400 })));
  const user = await renderExpanded();
  const keyInput = screen.getByLabelText("OpenAI API Key（更换时填写）");
  await user.type(keyInput, "replacement");
  await user.click(screen.getByRole("button", { name: "保存 OpenAI" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("保存失败，请刷新后重试");
  expect(keyInput).toHaveValue("");
});

test("supports clearing a key and clears replacement input after a network failure", async () => {
  const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
  vi.stubGlobal("fetch", fetchMock);
  const user = await renderExpanded();
  const keyInput = screen.getByLabelText("OpenAI API Key（更换时填写）");
  await user.type(keyInput, "replacement");
  await user.click(screen.getByLabelText("清除 OpenAI API Key"));
  await user.click(screen.getByRole("button", { name: "保存 OpenAI" }));
  expect(fetchMock).toHaveBeenCalledWith("/api/parent/ai-config", expect.objectContaining({
    body: expect.stringContaining("\"clearApiKey\":true"),
  }));
  expect(await screen.findByRole("alert")).toHaveTextContent("网络连接失败");
  expect(keyInput).toHaveValue("");
});

test("test button posts only provider and shows success", async () => {
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
    ok: true,
    provider: "openai",
    model: "gpt-5",
  }));
  vi.stubGlobal("fetch", fetchMock);
  const user = await renderExpanded();

  await user.click(screen.getByRole("button", { name: "测试 OpenAI" }));

  expect(fetchMock).toHaveBeenCalledWith("/api/parent/ai-test", expect.objectContaining({
    method: "POST",
    body: JSON.stringify({ provider: "openai" }),
  }));
  expect(await screen.findByText("OpenAI 连接正常")).toBeInTheDocument();
});

test("test button shows safe failure and does not send a key", async () => {
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
    error: { code: "ai_unavailable" },
  }, { status: 502 }));
  vi.stubGlobal("fetch", fetchMock);
  const user = await renderExpanded();

  await user.type(screen.getByLabelText("OpenAI API Key（更换时填写）"), "opaque-test-token");
  await user.click(screen.getByRole("button", { name: "测试 OpenAI" }));

  expect(fetchMock).toHaveBeenCalledWith("/api/parent/ai-test", expect.objectContaining({
    method: "POST",
    body: JSON.stringify({ provider: "openai" }),
  }));
  expect(fetchMock).not.toHaveBeenCalledWith("/api/parent/ai-test", expect.objectContaining({
    body: expect.stringContaining("opaque-test-token"),
  }));
  expect(await screen.findByText("连接失败，请检查配置")).toBeInTheDocument();
});

test("only the active provider test button is disabled while pending", async () => {
  let resolveFetch: ((value: Response) => void) | undefined;
  const fetchMock = vi.fn().mockImplementation(() => new Promise<Response>((resolve) => {
    resolveFetch = resolve;
  }));
  vi.stubGlobal("fetch", fetchMock);
  const user = await renderExpanded();

  const openAiTestButton = screen.getByRole("button", { name: "测试 OpenAI" });
  const deepSeekTestButton = screen.getByRole("button", { name: "测试 DeepSeek" });

  const clickPromise = user.click(openAiTestButton);
  await vi.waitFor(() => expect(openAiTestButton).toBeDisabled());
  expect(deepSeekTestButton).toBeEnabled();

  await act(async () => {
    resolveFetch?.(jsonResponse({ ok: true, provider: "openai", model: "gpt-5" }));
  });
  await clickPromise;
  expect(await screen.findByText("OpenAI 连接正常")).toBeInTheDocument();
});
