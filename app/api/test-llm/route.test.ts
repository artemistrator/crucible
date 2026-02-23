import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/ai/providers", () => ({
  getModel: vi.fn(() => ({})),
  getProviderApiKey: vi.fn(() => "key"),
  resolveProvider: vi.fn((x: string) => x || "zai"),
}));

vi.mock("ai", () => ({
  generateText: vi.fn().mockResolvedValue({ text: "pong" }),
}));

import { POST } from "./route";

describe("POST /api/test-llm", () => {
  it("returns pong when message is ping (mocked LLM)", async () => {
    const request = new Request("http://localhost/api/test-llm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "ping", provider: "zai", model: "glm-4.7" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    const data = (await response.json()) as { reply: string };
    expect(data.reply).toBe("pong");
  });

  it("returns 400 when message is empty", async () => {
    const request = new Request("http://localhost/api/test-llm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "   ", provider: "zai" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = (await response.json()) as { error: string };
    expect(data.error).toContain("required");
  });
});
