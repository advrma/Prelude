import { GoogleGenAI } from "@google/genai";
import type { Provider, ProviderArgs } from "./types";

// Real provider: Gemini via the official @google/genai SDK. Used only when GEMINI_API_KEY is set.

export class ProviderError extends Error {
  constructor(
    message: string,
    public status: number | undefined,
    public retryable: boolean,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

function statusOf(err: unknown): number | undefined {
  const e = err as { status?: unknown; code?: unknown };
  if (typeof e?.status === "number") return e.status;
  if (typeof e?.code === "number") return e.code;
  const m = /\b(4\d\d|5\d\d)\b/.exec(String((err as Error)?.message ?? ""));
  return m ? Number(m[1]) : undefined;
}

/** Human hint for an error, used by `npm run check` and router logs. */
export function hintFor(err: unknown): string {
  const status = statusOf(err);
  const msg = String((err as Error)?.message ?? err).toLowerCase();
  if (status === 404 || msg.includes("not found") || msg.includes("is not supported"))
    return "model ID not found → check the exact ID in Google AI Studio and update GEMINI_MODEL_FAST/SMART in .env";
  if (status === 401 || status === 403 || msg.includes("api key") || msg.includes("permission"))
    return "key rejected → re-copy GEMINI_API_KEY from Google AI Studio (no quotes, no spaces)";
  if (status === 429 || msg.includes("quota") || msg.includes("resource_exhausted"))
    return "rate limited / quota → wait a minute, or check the free-tier limits for this model";
  if (status === 400) return "bad request → the model may not support this option (e.g. JSON schema); see the error";
  if (status && status >= 500) return "Google-side error → retry in a minute";
  if (msg.includes("timeout") || msg.includes("aborted")) return "timed out → check your connection and retry";
  if (msg.includes("fetch failed") || msg.includes("enotfound") || msg.includes("econn")) return "network error → check your internet connection";
  return "unexpected error → read the message above";
}

function isSchemaRejection(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? "").toLowerCase();
  return statusOf(err) === 400 && (msg.includes("schema") || msg.includes("response_json") || msg.includes("responsejson"));
}

export function createGeminiProvider(apiKey: () => string): Provider {
  let client: GoogleGenAI | null = null;
  let clientKey = "";
  const getClient = () => {
    const key = apiKey();
    if (!client || key !== clientKey) {
      client = new GoogleGenAI({ apiKey: key });
      clientKey = key;
    }
    return client;
  };

  async function call(args: ProviderArgs, useSchema: boolean): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), args.timeoutMs);
    try {
      const res = await getClient().models.generateContent({
        model: args.model,
        contents: args.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
        config: {
          systemInstruction: args.system,
          temperature: args.jsonSchema ? 0.4 : 0.9,
          abortSignal: controller.signal,
          ...(args.jsonSchema
            ? { responseMimeType: "application/json", ...(useSchema ? { responseJsonSchema: args.jsonSchema } : {}) }
            : {}),
        },
      });
      const text = res.text ?? "";
      if (!text.trim()) throw new ProviderError("empty response", undefined, true);
      return text;
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      if (controller.signal.aborted) throw new ProviderError(`timeout after ${args.timeoutMs}ms`, undefined, true);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    name: "gemini",
    async generate(args) {
      try {
        return await call(args, true);
      } catch (err) {
        // Some models reject responseJsonSchema; retry once asking for plain JSON (Zod still validates).
        if (args.jsonSchema && isSchemaRejection(err)) return call(args, false);
        const status = statusOf(err);
        throw new ProviderError(
          String((err as Error)?.message ?? err),
          status,
          status === undefined || status === 429 || status >= 500,
        );
      }
    },
  };
}
