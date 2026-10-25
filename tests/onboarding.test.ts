import { describe, expect, it } from "vitest";
import {
  QUESTIONS,
  finalizeProfile,
  normalizeTurns,
  onboardTurn,
  parseGender,
  parseWants,
  profileFromAnswers,
  studentFromProfile,
} from "@/lib/agents/onboarding";
import { runMatching } from "@/lib/hub/pool";
import { getState, resetStore, updateState } from "@/lib/store";
import type { LlmMessage } from "@/lib/llm/types";
import { POST as onboardPOST } from "@/app/api/onboard/route";

const ANSWERS = [
  "Hey, I'm Riley, 21",
  "Woman",
  "Men and nonbinary people",
  "she/her",
  "Something serious",
  "climbing, board games, astronomy, boba",
  "Bouldering then a night at the observatory. Total night owl.",
  "Dealbreaker: smoking. Under $15. Vegetarian. Majoring in Geology, junior.",
];

async function chat(answers: string[]): Promise<LlmMessage[]> {
  const msgs: LlmMessage[] = [];
  for (let i = 0; i <= answers.length; i++) {
    const t = await onboardTurn(msgs);
    msgs.push({ role: "assistant", content: t.reply });
    if (t.done) break;
    if (i < answers.length) msgs.push({ role: "user", content: answers[i] });
  }
  return msgs;
}

describe("onboarding chat (mock)", () => {
  it("asks at most 8 questions, always including gender and who they want to meet", async () => {
    const msgs = await chat(ANSWERS);
    const questions = msgs.filter((m) => m.role === "assistant").slice(0, -1); // last one is the wrap-up
    expect(questions).toHaveLength(QUESTIONS.length);
    expect(QUESTIONS.length).toBeLessThanOrEqual(8);
    expect(questions[1].content).toMatch(/gender/i);
    expect(questions[1].content).toMatch(/self-describe/);
    expect(questions[1].content).toMatch(/prefer not to say/);
    expect(questions[2].content).toMatch(/who would you like to meet/i);
    expect(msgs.at(-1)!.content).toMatch(/profile/);
  });

  it("stops kindly if they're under 18", async () => {
    const t = await onboardTurn([
      { role: "assistant", content: QUESTIONS[0] },
      { role: "user", content: "I'm Sam, 17" },
    ]);
    expect(t).toMatchObject({ done: true, blocked: "under18" });
    expect(t.reply).toMatch(/18/);
  });

  it("builds the profile from explicit answers", async () => {
    const { profile } = await finalizeProfile(await chat(ANSWERS));
    expect(profile).toMatchObject({
      firstName: "Riley",
      age: 21,
      gender: "woman",
      wantsToMeet: ["man", "nonbinary"],
      pronouns: "she/her",
      intent: "serious",
      chronotype: "night-owl",
      budgetBand: "under_15",
      food: ["vegetarian"],
      dealbreakers: ["smoking"],
      major: "Geology",
      year: "Junior",
    });
    expect(profile.interests).toEqual(["climbing", "board games", "astronomy", "boba"]);
  });

  it("never infers gender or orientation: unclear answers become 'prefer not' / 'everyone'", async () => {
    const vague = [...ANSWERS];
    vague[1] = "pizza";
    vague[2] = "whoever is nice";
    vague[3] = "";
    const { profile } = await finalizeProfile(await chat(vague));
    expect(profile.gender).toBe("prefer-not");
    expect(profile.wantsToMeet).toBe("everyone");
    expect(profile.pronouns).toBe("they/them");
  });

  it("parses self-describe and the common phrasings", () => {
    expect(parseGender("self-describe: genderfluid")).toEqual({ gender: "self-describe", selfDescribe: "genderfluid" });
    expect(parseGender("Prefer not to say")).toEqual({ gender: "prefer-not" });
    expect(parseGender("non-binary")).toEqual({ gender: "nonbinary" });
    expect(parseGender("I'm a woman")).toEqual({ gender: "woman" });
    expect(parseWants("women")).toEqual(["woman"]);
    expect(parseWants("Everyone!")).toBe("everyone");
  });

  it("normalizes turns so the model sees user-first alternation", () => {
    expect(
      normalizeTurns([
        { role: "user", content: "a" },
        { role: "user", content: "b" },
        { role: "assistant", content: "c" },
      ]),
    ).toEqual([
      { role: "user", content: "a\n\nb" },
      { role: "assistant", content: "c" },
    ]);
  });
});

describe("saving a new student", () => {
  it("creates a valid student who then enters tonight's matching", async () => {
    await resetStore();
    const profile = profileFromAnswers(ANSWERS);
    const res = await onboardPOST(new Request("http://x", { method: "POST", body: JSON.stringify({ action: "save", email: "riley@example.edu", profile }) }));
    const body = await res.json();
    expect(body.ok).toBe(true);
    const s = await getState();
    const riley = s.students.find((x) => x.id === body.id)!;
    expect(riley.private.firstName).toBe("Riley");
    expect(riley.verifiedEdu).toBe(false);
    const summary = await updateState((st) => runMatching(st));
    expect(summary.evaluated).toBe((11 * 10) / 2);
    expect(s.pairs.some((p) => p.a === riley.id || p.b === riley.id)).toBe(true);
  });

  it("rejects non-.edu emails and under-18 profiles", async () => {
    const profile = profileFromAnswers(ANSWERS);
    const post = (body: unknown) => onboardPOST(new Request("http://x", { method: "POST", body: JSON.stringify(body) }));
    expect((await post({ action: "save", email: "riley@gmail.com", profile })).status).toBe(400);
    expect((await post({ action: "save", email: "riley@example.edu", profile: { ...profile, age: 17 } })).status).toBe(400);
  });

  it("re-onboarding with the same email updates instead of duplicating", () => {
    const p = profileFromAnswers(ANSWERS);
    expect(studentFromProfile(p, "Riley@Example.edu").id).toBe(studentFromProfile(p, "riley@example.edu").id);
  });
});
