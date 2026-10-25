import { loadEnvConfig } from "@next/env";

/** Load .env / .env.local the same way `next dev` does, so scripts and the app agree. */
export function loadEnv(flags: { mock?: boolean } = {}) {
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production", { info: () => {}, error: console.error });
  if (flags.mock) process.env.LLM_MODE = "mock";
}

export function hasFlag(name: string): boolean {
  return process.argv.slice(2).includes(`--${name}`);
}
