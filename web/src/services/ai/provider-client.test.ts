import { callAiProvider } from "./provider-client";

const TEST_KEY = "secret-test-key";

test("posts an OpenAI-compatible chat request with bearer auth and returns text", async () => {
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
    choices: [{ message: { content: "好的" } }],
  }), { status: 200 }));

  await expect(callAiProvider({
    baseUrl: "https://example.com/v1/",
    model: "gpt-test",
    apiKey: TEST_KEY,
    messages: [{ role: "user", content: "只回复好的" }],
    fetchImpl,
  })).resolves.toEqual({ text: "好的" });

  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(fetchImpl).toHaveBeenCalledWith("https://example.com/v1/chat/completions", expect.objectContaining({
    method: "POST",
    headers: expect.objectContaining({
      "content-type": "application/json",
      Authorization: `Bearer ${TEST_KEY}`,
    }),
    body: JSON.stringify({
      model: "gpt-test",
      messages: [{ role: "user", content: "只回复好的" }],
      temperature: 0.2,
    }),
  }));
});

test.each([408, 429, 500])("maps HTTP %s to a safe provider error", async (status) => {
  await expect(callAiProvider({
    baseUrl: "https://example.com/v1",
    model: "m",
    apiKey: TEST_KEY,
    messages: [],
    fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status })),
  })).rejects.toMatchObject({ code: "http" });
});

test("maps timeout without exposing auth", async () => {
  const fetchImpl = vi.fn<typeof fetch>().mockImplementation((_input, init) => new Promise((_, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  }));

  await expect(callAiProvider({
    baseUrl: "https://example.com/v1",
    model: "m",
    apiKey: TEST_KEY,
    messages: [],
    timeoutMs: 1,
    fetchImpl,
  })).rejects.toSatisfy((error: unknown) => {
    expect(error).toMatchObject({ code: "timeout" });
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(TEST_KEY);
    return true;
  });
});

test("maps network failure without exposing auth", async () => {
  await expect(callAiProvider({
    baseUrl: "https://example.com/v1",
    model: "m",
    apiKey: TEST_KEY,
    messages: [],
    fetchImpl: vi.fn<typeof fetch>().mockRejectedValue(new Error("offline")),
  })).rejects.toSatisfy((error: unknown) => {
    expect(error).toMatchObject({ code: "network" });
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(TEST_KEY);
    return true;
  });
});

test.each([
  ["missing choices", new Response("{}", { status: 200 })],
  ["empty content", new Response(JSON.stringify({ choices: [{ message: { content: "  " } }] }), { status: 200 })],
  ["malformed JSON", new Response("{", { status: 200 })],
] as const)("maps %s to invalid_response without exposing auth", async (_caseName, response) => {
  await expect(callAiProvider({
    baseUrl: "https://example.com/v1",
    model: "m",
    apiKey: TEST_KEY,
    messages: [],
    fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(response),
  })).rejects.toSatisfy((error: unknown) => {
    expect(error).toMatchObject({ code: "invalid_response" });
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(TEST_KEY);
    return true;
  });
});
