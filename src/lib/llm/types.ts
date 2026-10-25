import type { z } from "zod";
import type { Task } from "../config";
import type { NegotiateTurn } from "../schemas";
import type { BudgetBand, BusyBlock, Intent, Pronouns, TimeWindow, Vibe } from "../types";

export interface LlmMessage {
  role: "user" | "assistant";
  content: string;
}

/** Context only the mock provider reads. Real providers ignore it; it is not part of the cache key. */
export type MockContext =
  | {
      kind: "predate_turn";
      seed: string; // predate id
      turn: number; // 0-based global turn index
      totalTurns: number;
      me: Vibe;
      lastOther?: string; // what the other agent said (after the guard)
    }
  | {
      kind: "verdict";
      seed: string;
      me: Vibe;
      other: Vibe;
      matcherScore: number;
      sharedTags: string[];
      myIntent: Intent;
      theirIntent: Intent;
    }
  | {
      kind: "negotiate";
      seed: string;
      side: NegotiationSide;
      lastOther?: NegotiateTurn;
      round: number; // this side's round, 1-based
      maxRounds: number;
    }
  | {
      kind: "onboarding";
      step: number;
      answers: string[];
    };

/** What one negotiator agent knows: its own student's logistics only (§6.3). */
export interface NegotiationSide {
  id: string;
  pronouns: Pronouns;
  freeBusy: TimeWindow[];
  busy?: BusyBlock[];
  budgetBand: BudgetBand;
  food: string[];
  dateVibe: string[];
}

export interface LlmRequest {
  task: Task;
  system: string;
  messages: LlmMessage[];
  schema?: z.ZodType;
  mock?: MockContext;
}

export interface LlmResult {
  text: string;
  json?: unknown;
  model: string;
  cached: boolean;
  /** Set when the router could not get a real answer and fell back (§8.2). Never silent. */
  fallback?: "cache" | "mock";
  attempts?: { model: string; error: string }[];
}

export interface ProviderArgs {
  model: string;
  system: string;
  messages: LlmMessage[];
  jsonSchema?: Record<string, unknown>;
  timeoutMs: number;
}

export interface Provider {
  name: string;
  generate(args: ProviderArgs): Promise<string>;
}
