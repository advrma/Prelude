import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// The Gemini client is mocked: this proves that with GEMINI_API_KEY set, the app's real code path
// (router → limiter → Gemini provider) calls generateContent with the right model, prompt and schema.

const generateContent = vi.fn();
const ctorArgs: unknown[] = [];

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent };
    constructor(opts: unknown) {
      ctorArgs.push(opts);
    }
  },
}));

beforeEach(() => {
  generateContent.mockReset();
  ctorArgs.length = 0;
  process.env.GEMINI_API_KEY = "test-key-123";
  process.env.GEMINI_MODEL_FAST = "fast-model";
  process.env.GEMINI_MODEL_SMART = "smart-model";
  delete process.env.LLM_MODE;
});

afterEach(() => {
  delete process.env.GEMINI_API_KEY;
});

describe("live mode with GEMINI_API_KEY", () => {
  it("routes predate turns to the FAST model with the system prompt", async () => {
    generateContent.mockResolvedValue({ text: "She loves night hikes." });
    const { llm } = await import("@/lib/llm/router");
    const r = await llm({ task: "predate_turn", system: "SYSTEM", messages: [{ role: "user", content: "your turn" }] });

    expect(r).toMatchObject({ text: "She loves night hikes.", model: "fast-model", cached: false });
    expect(ctorArgs[0]).toEqual({ apiKey: "test-key-123" });
    const call = generateContent.mock.calls[0][0];
    expect(call.model).toBe("fast-model");
    expect(call.config.systemInstruction).toBe("SYSTEM");
    expect(call.contents).toEqual([{ role: "user", parts: [{ text: "your turn" }] }]);
  });

  it("uses structured output (responseJsonSchema) on the SMART model for verdicts and validates with Zod", async () => {
    generateContent.mockResolvedValue({ text: '{"score": 9}' });
    const { llm } = await import("@/lib/llm/router");
    const r = await llm({
      task: "verdict",
      system: "S",
      messages: [{ role: "user", content: "transcript" }],
      schema: z.object({ score: z.number() }),
    });
    const call = generateContent.mock.calls[0][0];
    expect(call.model).toBe("smart-model");
    expect(call.config.responseMimeType).toBe("application/json");
    expect(call.config.responseJsonSchema).toMatchObject({ type: "object", properties: { score: { type: "number" } } });
    expect(call.config.responseJsonSchema.$schema).toBeUndefined();
    expect(r.json).toEqual({ score: 9 });
  });

  it("falls back to the FAST model when SMART returns 429", async () => {
    generateContent
      .mockRejectedValueOnce(Object.assign(new Error("quota exceeded"), { status: 429 }))
      .mockResolvedValueOnce({ text: '{"score": 4}' });
    const { llm } = await import("@/lib/llm/router");
    const r = await llm({ task: "negotiate", system: "S2", messages: [{ role: "user", content: "x" }], schema: z.object({ score: z.number() }) });
    expect(generateContent.mock.calls.map((c) => c[0].model)).toEqual(["smart-model", "fast-model"]);
    expect(r.model).toBe("fast-model");
  });

  it("retries without the schema when a model rejects responseJsonSchema", async () => {
    generateContent
      .mockRejectedValueOnce(Object.assign(new Error("400 Invalid response_json_schema"), { status: 400 }))
      .mockResolvedValueOnce({ text: '{"score": 2}' });
    const { llm } = await import("@/lib/llm/router");
    const r = await llm({ task: "verdict", system: "S3", messages: [{ role: "user", content: "y" }], schema: z.object({ score: z.number() }) });
    expect(generateContent.mock.calls[1][0].config.responseJsonSchema).toBeUndefined();
    expect(generateContent.mock.calls[1][0].config.responseMimeType).toBe("application/json");
    expect(r.json).toEqual({ score: 2 });
  });

  it("does not call Gemini at all without a key", async () => {
    delete process.env.GEMINI_API_KEY;
    const { llm } = await import("@/lib/llm/router");
    const r = await llm({ task: "predate_turn", system: "S", messages: [{ role: "user", content: "z" }] });
    expect(r.model).toBe("mock");
    expect(generateContent).not.toHaveBeenCalled();
  });
});
