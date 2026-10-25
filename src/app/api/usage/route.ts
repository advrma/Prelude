import { config, getMode } from "@/lib/config";
import { getLimiter } from "@/lib/llm/limiter";

export const dynamic = "force-dynamic";

export function GET() {
  const snapshot = getLimiter().snapshot([config.modelFast(), config.modelSmart()]);
  return Response.json({ mode: getMode(), ...snapshot });
}
