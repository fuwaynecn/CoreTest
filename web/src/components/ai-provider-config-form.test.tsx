import { render, screen } from "@testing-library/react";
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

test("renders both providers, editable address/model, masked key, and enabled switch", () => {
  render(<AiProviderConfigForm initial={initialViews} />);
  expect(screen.getByRole("group", { name: "OpenAI" })).toBeInTheDocument();
  expect(screen.getByRole("group", { name: "DeepSeek" })).toBeInTheDocument();
  expect(screen.getByDisplayValue("gpt-5")).toBeInTheDocument();
  expect(screen.getByText("••••••-key")).toBeInTheDocument();
});

test("submits a replacement key without pre-filling the old key", async () => {
  const user = userEvent.setup();
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
    provider: { ...initialViews[0], hasApiKey: true, apiKeyMasked: "••••••new" },
  }));
  vi.stubGlobal("fetch", fetchMock);
  render(<AiProviderConfigForm initial={initialViews} />);
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
  const user = userEvent.setup();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, { status: 400 })));
  render(<AiProviderConfigForm initial={initialViews} />);
  const keyInput = screen.getByLabelText("OpenAI API Key（更换时填写）");
  await user.type(keyInput, "replacement");
  await user.click(screen.getByRole("button", { name: "保存 OpenAI" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("保存失败，请刷新后重试");
  expect(keyInput).toHaveValue("");
});

test("supports clearing a key and clears replacement input after a network failure", async () => {
  const user = userEvent.setup();
  const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
  vi.stubGlobal("fetch", fetchMock);
  render(<AiProviderConfigForm initial={initialViews} />);
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
