// npm run shots -- [--base http://localhost:3000] [--out screenshots] [/path ...]
// Screenshots every screen at 375px (mobile) and 1280px (desktop) using the Edge or Chrome already
// installed on this machine (playwright-core, no browser download). Used for the §12 mobile check.
import fs from "node:fs";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const base = arg("base", "http://localhost:3000");
const out = path.resolve(arg("out", "screenshots"));
const paths = process.argv.slice(2).filter((a, i, all) => a.startsWith("/") && !all[i - 1]?.startsWith("--"));
const targets = paths.length ? paths : ["/", "/matches?as=s01", "/predate/pd_s01_s02?speed=fast", "/hub", "/onboard"];

async function launch(): Promise<Browser> {
  for (const channel of ["msedge", "chrome"]) {
    try {
      return await chromium.launch({ channel, headless: true });
    } catch {
      /* try next */
    }
  }
  throw new Error("No Edge or Chrome found. Install one, or run: npx playwright install chromium");
}

async function settle(page: Page, url: string) {
  if (url.includes("/predate/")) {
    // Wait for the stream to finish (verdict banner) so the shot shows the whole story.
    await page.waitForSelector("text=/It's a match|No match/", { timeout: 60_000 }).catch(() => {});
  } else if (url.includes("/date")) {
    // Wait for the negotiation to finish animating and the options (or the booked card) to show.
    await page.waitForSelector("text=/Pick one|It's a date|Not unlocked/", { timeout: 60_000 }).catch(() => {});
  } else {
    await page.waitForLoadState("networkidle").catch(() => {});
  }
  await page.waitForTimeout(600);
}

async function main() {
  fs.mkdirSync(out, { recursive: true });
  const browser = await launch();
  const problems: string[] = [];
  for (const [label, width, height] of [
    ["mobile", 375, 812],
    ["desktop", 1280, 900],
  ] as const) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, colorScheme: "dark" });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => problems.push(`[${label}] page error: ${e.message}`));
    page.on("console", (m) => m.type() === "error" && problems.push(`[${label}] console: ${m.text()}`));
    for (const t of targets) {
      const url = base + t;
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await settle(page, url);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 1) problems.push(`[${label}] ${t} scrolls horizontally by ${overflow}px`);
      const name = `${label}-${t.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "home"}.png`;
      await page.screenshot({ path: path.join(out, name), fullPage: true });
      console.log(`📸 ${name}`);
    }
    await ctx.close();
  }
  await browser.close();
  if (problems.length) {
    console.log("\nProblems:");
    for (const p of problems) console.log(`  ⚠️  ${p}`);
    process.exitCode = 1;
  } else console.log("\n✅ No horizontal overflow, no page errors.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
