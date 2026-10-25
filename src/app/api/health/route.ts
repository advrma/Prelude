import { config, getMode } from "@/lib/config";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    mode: getMode(),
    models: { fast: config.modelFast(), smart: config.modelSmart() },
    keyPresent: config.keyPresent(),
  });
}
