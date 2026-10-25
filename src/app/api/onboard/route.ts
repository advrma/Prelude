import { finalizeProfile, onboardTurn, studentFromProfile } from "@/lib/agents/onboarding";
import { jsonError, parseBody } from "@/lib/api";
import { OnboardBodySchema } from "@/lib/schemas";
import { updateState } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Onboarding chat (§6.4). Stateless: the client sends the whole chat each time.
 *   { action: "turn", messages }          → next agent question
 *   { action: "finalize", messages }      → structured profile preview
 *   { action: "save", email, profile }    → creates/updates the student
 */
export async function POST(req: Request) {
  const body = await parseBody(req, OnboardBodySchema);
  if (!body.ok) return body.res;
  const { action, messages, email, profile } = body.data;

  if (action === "turn") return Response.json(await onboardTurn(messages));

  if (action === "finalize") {
    const result = await finalizeProfile(messages);
    return Response.json(result);
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.edu$/i.test(email)) return jsonError(400, "A .edu email is required");
  if (!profile) return jsonError(400, "Missing profile");
  if (profile.age < 18) return jsonError(400, "Prelude is 18+ only");
  let student;
  try {
    student = studentFromProfile(profile, email);
  } catch (err) {
    return jsonError(400, "Profile didn't validate", { detail: String((err as Error)?.message ?? err).slice(0, 300) });
  }
  await updateState((s) => {
    const i = s.students.findIndex((x) => x.id === student.id);
    if (i >= 0) s.students[i] = student;
    else s.students.push(student);
  });
  return Response.json({ ok: true, id: student.id, firstName: student.private.firstName });
}
