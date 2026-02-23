import { describe, it, expect } from "vitest";

import { POST } from "./route";

const ZAI_READY = !!(
  process.env.ZAI_API_KEY?.trim() && process.env.ZAI_BASE_URL?.trim()
);

describe("POST /api/test-llm (integration, real Z.ai GLM-4.7)", () => {
  it.skipIf(!ZAI_READY)(
    "ping → reply contains pong",
    async () => {
      const res = await POST(
        new Request("http://localhost/api/test-llm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: "ping",
            provider: "zai",
            model: "glm-4.7",
          }),
        })
      );

      expect(res.status).toBe(200);
      const data = (await res.json()) as { reply?: string; error?: string };
      expect(data.error).toBeUndefined();
      expect(data.reply).toBeDefined();
      expect(typeof data.reply).toBe("string");
      expect(data.reply!.length).toBeGreaterThan(0);
      expect(data.reply!.toLowerCase()).toContain("pong");
    },
    45000
  );

  it.skipIf(!ZAI_READY)(
    "2+2 → reply contains 4",
    async () => {
      const res = await POST(
        new Request("http://localhost/api/test-llm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: "What is 2+2? Reply with only the number, nothing else.",
            provider: "zai",
            model: "glm-4.7",
          }),
        })
      );

      expect(res.status).toBe(200);
      const data = (await res.json()) as { reply?: string; error?: string };
      expect(data.error).toBeUndefined();
      expect(data.reply).toBeDefined();
      expect(typeof data.reply).toBe("string");
      expect(data.reply!.length).toBeGreaterThan(0);
      expect(data.reply!).toContain("4");
    },
    45000
  );

  it.skipIf(!ZAI_READY)(
    "single word prompt → non-empty reply",
    async () => {
      const res = await POST(
        new Request("http://localhost/api/test-llm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: "ok",
            provider: "zai",
            model: "glm-4.7",
          }),
        })
      );

      expect(res.status).toBe(200);
      const data = (await res.json()) as { reply?: string; error?: string };
      expect(data.error).toBeUndefined();
      expect(data.reply).toBeDefined();
      expect(typeof data.reply).toBe("string");
      expect(data.reply!.length).toBeGreaterThan(0);
    },
    45000
  );
});
