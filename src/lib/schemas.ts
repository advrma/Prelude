import { z } from "zod";
import { BUDGET_BANDS, GENDERS, INTENTS, WEEKDAYS } from "./types";

// Zod schemas for every LLM JSON output and every API body (§4).

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "time must be HH:MM");

export const GenderSchema = z.enum(GENDERS as [string, ...string[]]);
export const IntentSchema = z.enum(INTENTS as [string, ...string[]]);
export const BudgetSchema = z.enum(BUDGET_BANDS as [string, ...string[]]);
export const WeekdaySchema = z.enum(WEEKDAYS as [string, ...string[]]);

export const TimeWindowSchema = z.object({ day: WeekdaySchema, start: hhmm, end: hhmm });

export const StudentSchema = z.object({
  id: z.string().min(1),
  email: z.string().regex(/^[^\s@]+@[^\s@]+\.edu$/i, "must be a .edu email"),
  verifiedEdu: z.boolean(),
  filters: z.object({
    gender: GenderSchema,
    genderSelfDescribe: z.string().max(60).optional(),
    wantsToMeet: z.union([z.literal("everyone"), z.array(GenderSchema).min(1)]),
    age: z.number().int().min(18, "Prelude is 18+ only").max(99),
    ageMin: z.number().int().min(18),
    ageMax: z.number().int().max(99),
    intent: IntentSchema,
    dealbreakers: z.array(z.string().max(40)).max(10),
    campus: z.string().min(1),
  }),
  vibe: z.object({
    pronouns: z.enum(["she/her", "he/him", "they/them"]),
    interests: z.array(z.string().min(1).max(40)).min(1).max(12),
    values: z.array(z.string().min(1).max(40)).max(8),
    humor: z.string().max(200),
    perfectWeekend: z.string().max(300),
    socialEnergy: z.enum(["homebody", "balanced", "out-every-night"]),
    chronotype: z.enum(["early-bird", "flexible", "night-owl"]),
    bio: z.string().max(400),
  }),
  private: z.object({
    firstName: z.string().min(1).max(40),
    major: z.string().max(60),
    year: z.string().max(30),
    photos: z.array(z.string()).max(6),
    contact: z.string().max(120),
    freeBusy: z.array(TimeWindowSchema).max(21),
    busy: z.array(TimeWindowSchema.extend({ label: z.string().max(60) })).max(21).optional(),
    budgetBand: BudgetSchema,
    food: z.array(z.string().max(40)).max(8),
    dateVibe: z.array(z.string().max(40)).max(8),
  }),
});

/** What the verdict LLM returns (studentId is added by code). */
export const VerdictOutputSchema = z.object({
  score: z.number().min(0).max(10),
  highlights: z.array(z.string().min(1).max(200)).min(1).max(3),
  flags: z.array(z.string().min(1).max(200)).max(2),
  summaryForStudent: z.string().min(1).max(500),
});
export type VerdictOutput = z.infer<typeof VerdictOutputSchema>;

/** One negotiator turn (§6.3). */
export const NegotiateTurnSchema = z.object({
  type: z.enum(["propose", "counter", "accept", "need_human"]),
  content: z.string().min(1).max(500),
  data: z
    .object({
      day: WeekdaySchema.optional(),
      start: hhmm.optional(),
      budgetBand: BudgetSchema.optional(),
      place: z.string().max(80).optional(),
    })
    .default({}),
});
export type NegotiateTurn = z.infer<typeof NegotiateTurnSchema>;

/** Onboarding finalize: the profile fields the LLM extracts from the chat. */
export const OnboardProfileSchema = z.object({
  firstName: z.string().min(1).max(40),
  age: z.number().int().min(18).max(99),
  gender: GenderSchema,
  genderSelfDescribe: z.string().max(60).optional(),
  wantsToMeet: z.union([z.literal("everyone"), z.array(GenderSchema).min(1)]),
  pronouns: z.enum(["she/her", "he/him", "they/them"]),
  intent: IntentSchema,
  interests: z.array(z.string().min(1).max(40)).min(1).max(10),
  values: z.array(z.string().max(40)).max(6),
  humor: z.string().max(200),
  perfectWeekend: z.string().max(300),
  socialEnergy: z.enum(["homebody", "balanced", "out-every-night"]),
  chronotype: z.enum(["early-bird", "flexible", "night-owl"]),
  dealbreakers: z.array(z.string().max(40)).max(6),
  major: z.string().max(60),
  year: z.string().max(30),
  budgetBand: BudgetSchema,
  food: z.array(z.string().max(40)).max(6),
  dateVibe: z.array(z.string().max(40)).max(6),
  bio: z.string().max(400),
});
export type OnboardProfile = z.infer<typeof OnboardProfileSchema>;

// ---- API bodies ----

export const YesBodySchema = z.object({ as: z.string().min(1), level: z.number().int().min(1).max(3) });
export const AsBodySchema = z.object({ as: z.string().min(1) });
export const ReportBodySchema = z.object({ as: z.string().min(1), reason: z.string().max(300).default("") });
export const ChatBodySchema = z.object({ as: z.string().min(1), text: z.string().trim().min(1).max(280) });
export const PickBodySchema = z.object({ as: z.string().min(1), option: z.number().int().min(0).max(2) });
export const OnboardBodySchema = z.object({
  action: z.enum(["turn", "finalize", "save"]),
  email: z.string().optional(),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2000) }))
    .max(40)
    .default([]),
  profile: OnboardProfileSchema.optional(),
});

/** Gemini's responseJsonSchema wants plain JSON Schema without the $schema marker. */
export function toGeminiJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { io: "output" }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}
