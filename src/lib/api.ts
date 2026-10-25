import type { z } from "zod";

// Small helpers shared by API route handlers.

export function jsonError(status: number, error: string, extra: Record<string, unknown> = {}) {
  return Response.json({ error, ...extra }, { status });
}

export async function parseBody<T extends z.ZodType>(req: Request, schema: T): Promise<{ ok: true; data: z.infer<T> } | { ok: false; res: Response }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, res: jsonError(400, "Body must be JSON") };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, res: jsonError(400, "Invalid request body", { issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }) };
  }
  return { ok: true, data: parsed.data };
}

export function asParam(req: Request): string | undefined {
  return new URL(req.url).searchParams.get("as") ?? undefined;
}
