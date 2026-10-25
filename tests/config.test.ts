import { afterEach, describe, expect, it } from "vitest";
import { config, getMode, modelChain } from "@/lib/config";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe("config", () => {
  it("defaults to mock mode with no key", () => {
    delete process.env.GEMINI_API_KEY;
    expect(getMode()).toBe("mock");
  });

  it("switches to live automatically when GEMINI_API_KEY is set", () => {
    process.env.GEMINI_API_KEY = "test-key";
    expect(getMode()).toBe("live");
  });

  it("honours LLM_MODE overrides", () => {
    process.env.GEMINI_API_KEY = "test-key";
    process.env.LLM_MODE = "replay";
    expect(getMode()).toBe("replay");
    process.env.LLM_MODE = "mock";
    expect(getMode()).toBe("mock");
  });

  it("strips inline comments copied from .env.example", () => {
    process.env.GEMINI_MODEL_FAST = "gemini-x      # confirm exact ID";
    expect(config.modelFast()).toBe("gemini-x");
  });

  it("builds the model chains from §8.2", () => {
    process.env.GEMINI_MODEL_FAST = "fast";
    process.env.GEMINI_MODEL_SMART = "smart";
    expect(modelChain("predate_turn")).toEqual(["fast", "smart"]);
    expect(modelChain("verdict")).toEqual(["smart", "fast"]);
    expect(modelChain("negotiate")).toEqual(["smart", "fast"]);
    expect(modelChain("onboarding")).toEqual(["smart", "fast"]);
  });
});
