import { createHash } from "node:crypto";
import { ONBOARDING_QUESTIONS } from "../llm/mock";
import { llm } from "../llm/router";
import type { LlmMessage } from "../llm/types";
import { OnboardProfileSchema, StudentSchema, type OnboardProfile } from "../schemas";
import type { BudgetBand, Gender, Intent, Pronouns, Student, Vibe } from "../types";
import { onboardingExtractSystem, onboardingSystem } from "./prompts";

// Onboarding agent (§6.4): ≤8 questions. The ORDER of topics is fixed in code (so gender and who they
// want to meet are always asked); the LLM only phrases the next question. Explicit answers are parsed
// in code and override anything the model extracts, so gender/orientation are never inferred.

export const QUESTIONS = ONBOARDING_QUESTIONS;
export const Q = { nameAge: 0, gender: 1, wants: 2, pronouns: 3, intent: 4, interests: 5, weekend: 6, logistics: 7 } as const;

export function answersOf(messages: LlmMessage[]): string[] {
  return messages.filter((m) => m.role === "user").map((m) => m.content.trim());
}

// ---- explicit-answer parsers (no inference: only what the student actually said) ----

export function parseAge(t: string): number | null {
  const m = /\b(\d{1,2})\b/.exec(t);
  return m ? Number(m[1]) : null;
}

export function parseGender(t: string): { gender: Gender; selfDescribe?: string } | null {
  const s = t.toLowerCase();
  if (/prefer not|rather not|don't want to say|pass\b/.test(s)) return { gender: "prefer-not" };
  if (/self[- ]?describ/.test(s)) {
    const rest = t.replace(/self[- ]?describe[:,\s-]*/i, "").trim();
    return { gender: "self-describe", selfDescribe: rest.slice(0, 60) || undefined };
  }
  if (/\b(non-?binary|enby|nb)\b/.test(s)) return { gender: "nonbinary" };
  if (/\b(woman|female|girl)\b/.test(s)) return { gender: "woman" };
  if (/\b(man|male|guy)\b/.test(s)) return { gender: "man" };
  return null;
}

export function parseWants(t: string): Gender[] | "everyone" | null {
  const s = t.toLowerCase();
  if (/\b(everyone|anyone|all genders|any gender|everybody)\b/.test(s)) return "everyone";
  const out: Gender[] = [];
  if (/\b(women|woman|girls|females?)\b/.test(s)) out.push("woman");
  if (/\b(men|man|guys|males?)\b/.test(s)) out.push("man");
  if (/\b(non-?binary|enbies|enby|nb)\b/.test(s)) out.push("nonbinary");
  return out.length ? out : null;
}

export function parsePronouns(t: string): Pronouns | null {
  const s = t.toLowerCase();
  if (/\bthey\b|\bthem\b/.test(s)) return "they/them";
  if (/\bshe\b|\bher\b/.test(s)) return "she/her";
  if (/\bhe\b|\bhim\b/.test(s)) return "he/him";
  return null;
}

export function parseIntent(t: string): Intent | null {
  const s = t.toLowerCase();
  if (/friends? first/.test(s)) return "friends-first";
  if (/see where|go with the flow|open to/.test(s)) return "see-where-it-goes";
  if (/serious|long[- ]term|relationship/.test(s)) return "serious";
  if (/casual|fun|nothing serious/.test(s)) return "casual";
  return null;
}

function parseChronotype(t: string): Vibe["chronotype"] {
  const s = t.toLowerCase();
  if (/early|morning|sunrise/.test(s)) return "early-bird";
  if (/night owl|night-owl|late/.test(s)) return "night-owl";
  return "flexible";
}

function parseSocial(t: string): Vibe["socialEnergy"] {
  const s = t.toLowerCase();
  if (/homebody|stay in|cozy|night in/.test(s)) return "homebody";
  if (/out every|party|going out|clubbing/.test(s)) return "out-every-night";
  return "balanced";
}

function parseBudget(t: string): BudgetBand {
  const m = /(?:under|<|\$)\s*\$?\s*(10|15|30|50)\b/i.exec(t);
  return m ? (`under_${m[1]}` as BudgetBand) : "under_15";
}

const FOODS = ["vegetarian", "vegan", "halal", "kosher", "gluten-free", "no seafood", "no dairy"];
function parseFood(t: string): string[] {
  const s = t.toLowerCase().replace("gluten free", "gluten-free");
  return FOODS.filter((f) => s.includes(f));
}

function parseDealbreakers(t: string): string[] {
  const s = t.toLowerCase();
  const out: string[] = [];
  if (/smok|vap/.test(s)) out.push("smoking");
  if (/partying|party animal/.test(s)) out.push("partying");
  return out;
}

function parseName(t: string): string {
  const stop = new Set(["hi", "hey", "hello", "i'm", "im", "i", "am", "call", "me", "my", "name", "is", "and", "it's", "its", "yes", "years", "old", "yo"]);
  const words = t.match(/[A-Za-z][A-Za-z'-]*/g) ?? [];
  const w = words.find((x) => !stop.has(x.toLowerCase()));
  return w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : "Alex";
}

function parseMajorYear(t: string): { major: string; year: string } {
  const year = /\b(freshman|sophomore|junior|senior|grad(?:uate)? student|first[- ]year|second[- ]year|third[- ]year|fourth[- ]year)\b/i.exec(t)?.[1];
  const major = /(?:major(?:ing)? in|study(?:ing)?|majoring)\s+([A-Za-z &]+?)(?:[,.;]|\s+(?:and|as|,)\s|$)/i.exec(t)?.[1];
  return { major: major?.trim() || "Undeclared", year: year ? year[0].toUpperCase() + year.slice(1).toLowerCase() : "Sophomore" };
}

/** Deterministic profile from explicit answers (mock mode, and the safety net for live mode). */
export function profileFromAnswers(a: string[]): OnboardProfile {
  const g = parseGender(a[Q.gender] ?? "");
  const interests = (a[Q.interests] ?? "")
    .split(/,|\band\b|\//)
    .map((x) => x.trim().toLowerCase())
    .filter((x) => x.length > 1)
    .slice(0, 8);
  const weekend = a[Q.weekend] ?? "";
  const logistics = a[Q.logistics] ?? "";
  const { major, year } = parseMajorYear(logistics);
  const tags = interests.length ? interests : ["coffee", "live music", "long walks"];
  return {
    firstName: parseName(a[Q.nameAge] ?? ""),
    age: Math.max(18, parseAge(a[Q.nameAge] ?? "") ?? 18),
    gender: g?.gender ?? "prefer-not",
    ...(g?.selfDescribe ? { genderSelfDescribe: g.selfDescribe } : {}),
    wantsToMeet: parseWants(a[Q.wants] ?? "") ?? "everyone",
    pronouns: parsePronouns(a[Q.pronouns] ?? "") ?? "they/them",
    intent: parseIntent(a[Q.intent] ?? "") ?? "see-where-it-goes",
    interests: tags,
    values: ["kindness", "curiosity", "humor"],
    humor: "Warm, a little goofy, laughs easily.",
    perfectWeekend: weekend.slice(0, 300) || "Exploring somewhere new around Tempe, then a slow coffee.",
    socialEnergy: parseSocial(weekend),
    chronotype: parseChronotype(weekend),
    dealbreakers: parseDealbreakers(logistics),
    major,
    year,
    budgetBand: parseBudget(logistics),
    food: parseFood(logistics),
    dateVibe: ["low-key", "coffee", ...tags.slice(0, 2)].slice(0, 4),
    bio: `Into ${tags.slice(0, 3).join(", ")}. Looking for someone kind who's up for a little adventure around campus.`,
  };
}

/** Gemini wants alternating turns starting with the user: merge consecutive same-role messages. */
export function normalizeTurns(messages: LlmMessage[]): LlmMessage[] {
  const out: LlmMessage[] = [];
  for (const m of messages) {
    const last = out.at(-1);
    if (last && last.role === m.role) last.content += `\n\n${m.content}`;
    else out.push({ ...m });
  }
  return out;
}

export interface TurnResult {
  reply: string;
  step: number; // index of the question just asked; QUESTIONS.length when done
  done: boolean;
  blocked?: "under18";
  model: string;
}

/** Next agent message given the chat so far (assistant/user alternating, starting with the agent). */
export async function onboardTurn(messages: LlmMessage[]): Promise<TurnResult> {
  const answers = answersOf(messages);
  if (answers.length >= 1) {
    const age = parseAge(answers[0]);
    if (age !== null && age < 18) {
      return {
        reply: "Thanks for being honest. Prelude is only for students 18 and older, so I can't set you up yet. Take care!",
        step: QUESTIONS.length,
        done: true,
        blocked: "under18",
        model: "rule",
      };
    }
  }
  const step = answers.length;
  if (step >= QUESTIONS.length) {
    return { reply: "That's everything I need! Let me put your profile together so you can check it.", step, done: true, model: "rule" };
  }
  const instruction = `(Hub instruction: ask question ${step + 1} of ${QUESTIONS.length} now, warmly in 1–2 sentences, keeping every option listed: "${QUESTIONS[step]}"${step > 0 ? " You may briefly acknowledge their last answer first." : ""})`;
  const res = await llm({
    task: "onboarding",
    system: onboardingSystem(QUESTIONS),
    messages: normalizeTurns([{ role: "user", content: "(The student opened the onboarding chat.)" }, ...messages, { role: "user", content: instruction }]),
    mock: { kind: "onboarding", step, answers },
  });
  return { reply: res.text.trim() || QUESTIONS[step], step, done: false, model: res.model };
}

/** Structured profile from the chat. LLM extraction in live mode, then explicit answers win. */
export async function finalizeProfile(messages: LlmMessage[]): Promise<{ profile: OnboardProfile; model: string }> {
  const answers = answersOf(messages);
  const parsed = profileFromAnswers(answers);
  const transcript = messages.map((m) => `${m.role === "user" ? "Student" : "Agent"}: ${m.content}`).join("\n");
  const res = await llm({
    task: "onboarding",
    system: onboardingExtractSystem(),
    messages: [{ role: "user", content: `Onboarding chat:\n${transcript}\n\nReturn the profile JSON.` }],
    schema: OnboardProfileSchema,
    mock: { kind: "onboarding", step: QUESTIONS.length, answers },
  });
  const fromLlm = OnboardProfileSchema.safeParse(res.json);
  const base = fromLlm.success ? fromLlm.data : parsed;
  // Never inferred: identity fields come only from what the student explicitly answered.
  const g = parseGender(answers[Q.gender] ?? "");
  const profile: OnboardProfile = {
    ...base,
    gender: g?.gender ?? "prefer-not",
    genderSelfDescribe: g?.selfDescribe,
    wantsToMeet: parseWants(answers[Q.wants] ?? "") ?? "everyone",
    pronouns: parsePronouns(answers[Q.pronouns] ?? "") ?? "they/them",
    age: Math.max(18, parseAge(answers[Q.nameAge] ?? "") ?? base.age),
  };
  if (!profile.genderSelfDescribe) delete profile.genderSelfDescribe;
  return { profile, model: fromLlm.success ? res.model : "rule" };
}

/** Turn a confirmed profile into a Student (validated). Schedules aren't asked; sensible defaults are used. */
export function studentFromProfile(p: OnboardProfile, email: string): Student {
  const id = `u_${createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 8)}`;
  const student: Student = {
    id,
    email: email.toLowerCase(),
    verifiedEdu: false, // demo: domain check only; real .edu SSO is "coming soon"
    filters: {
      gender: p.gender,
      ...(p.genderSelfDescribe ? { genderSelfDescribe: p.genderSelfDescribe } : {}),
      wantsToMeet: p.wantsToMeet,
      age: p.age,
      ageMin: Math.max(18, p.age - 2),
      ageMax: p.age + 4,
      intent: p.intent,
      dealbreakers: p.dealbreakers,
      campus: "ASU Tempe",
    },
    vibe: {
      pronouns: p.pronouns,
      interests: p.interests.map((i) => i.toLowerCase()),
      values: p.values.map((v) => v.toLowerCase()),
      humor: p.humor,
      perfectWeekend: p.perfectWeekend,
      socialEnergy: p.socialEnergy,
      chronotype: p.chronotype,
      bio: p.bio,
    },
    private: {
      firstName: p.firstName,
      major: p.major,
      year: p.year,
      photos: ["/avatars/new-1.svg", "/avatars/new-2.svg"],
      contact: "demo-only (contact unlocks after the date)",
      freeBusy: [
        { day: "Thu", start: "18:00", end: "22:00" },
        { day: "Fri", start: "17:00", end: "23:00" },
        { day: "Sat", start: "11:00", end: "22:00" },
        { day: "Sun", start: "12:00", end: "18:00" },
      ],
      busy: [],
      budgetBand: p.budgetBand,
      food: p.food,
      dateVibe: p.dateVibe.length ? p.dateVibe : ["low-key", "coffee"],
    },
  };
  return StudentSchema.parse(student) as Student;
}
