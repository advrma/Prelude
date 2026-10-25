// npm run e2e -- [--base http://localhost:3000] [--out screenshots/e2e] [--width 375]
// Clicks through the full §12 demo path in a real browser (local Edge/Chrome via playwright-core):
// reset → run matching → watch a pre-date (guard chip + verdicts) → YES through levels 1–3 as Maya and
// Jordan → negotiation → 3 options → both pick → .ics download. Needs the app running (npm run dev / start).
import fs from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright-core";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const base = arg("base", "http://localhost:3000");
const out = path.resolve(arg("out", "screenshots/e2e"));
const width = Number(arg("width", "375"));

let n = 0;
async function shot(page: Page, name: string) {
  n++;
  await page.screenshot({ path: path.join(out, `${String(n).padStart(2, "0")}-${name}.png`), fullPage: true });
}

function step(msg: string) {
  console.log(`✔ ${msg}`);
}

async function yes(page: Page, as: string, cta: RegExp) {
  await page.goto(`${base}/matches?as=${as}`);
  const btn = page.getByRole("button", { name: cta });
  await btn.waitFor({ timeout: 20_000 });
  await btn.click();
}

async function main() {
  fs.mkdirSync(out, { recursive: true });
  let browser;
  for (const channel of ["msedge", "chrome"]) {
    try {
      browser = await chromium.launch({ channel, headless: true });
      break;
    } catch {
      /* next */
    }
  }
  if (!browser) throw new Error("No Edge/Chrome found");
  const ctx = await browser.newContext({ viewport: { width, height: 860 }, acceptDownloads: true, colorScheme: "dark" });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // 1. Seed
  const seed = await page.request.post(`${base}/api/seed`);
  if (!seed.ok()) throw new Error(`seed failed: ${seed.status()}`);
  step("seed: personas loaded");

  // 2. Run matching from the landing page
  await page.goto(base);
  await page.getByRole("button", { name: /Run tonight's matching/ }).first().click();
  await page.getByText(/The hub checked \d+ pairs/).waitFor({ timeout: 30_000 });
  await shot(page, "landing-after-run");
  step("run matching: pairs checked, pre-dates created");

  // 3. Watch the showcase pre-date stream
  await page.goto(`${base}/predate/pd_s01_s02`);
  await page.getByText("It's a match").waitFor({ timeout: 60_000 });
  const blockedChips = await page.locator(".chip-danger").count();
  if (blockedChips < 1) throw new Error("expected a blocked-leak chip on the showcase pre-date");
  const flags = await page.getByText(/see where it goes/).count();
  if (flags < 1) throw new Error("expected the serious vs see-where-it-goes verdict flag");
  await shot(page, "watch-the-date");
  step(`watch the date: streamed, ${blockedChips} guard chip(s), verdict flag shown, match`);

  // 4. YES through stages 1–3 as two personas
  await yes(page, "s01", /Yes, show photos/);
  await page.getByText(/Waiting for them/).waitFor();
  await shot(page, "maya-waiting-l1");
  await yes(page, "s02", /Yes, show photos/);
  await page.getByText("Astrophysics", { exact: false }).waitFor();
  await shot(page, "jordan-sees-l1");
  step("level 1: both YES → major, year, photos revealed");

  await yes(page, "s02", /Yes, swap names/);
  await yes(page, "s01", /Yes, swap names/);
  await page.getByRole("heading", { name: "Jordan" }).waitFor();
  await page.getByLabel("Chat message").fill("Hi! Your agent said you shoot film?");
  await page.getByRole("button", { name: "Send" }).click();
  await page.getByText("Your agent said you shoot film").waitFor();
  await shot(page, "maya-l2-chat");
  step("level 2: both YES → first names + say-hi chat");

  await yes(page, "s01", /Yes, plan a date/);
  await yes(page, "s02", /Yes, plan a date/);
  await page.getByRole("link", { name: /Plan the date/ }).click();
  step("level 3: both YES → negotiator starts");

  // 5. Negotiation → 3 options → picks
  await page.getByText("Pick one").waitFor({ timeout: 60_000 });
  const options = await page.getByRole("button", { name: "Pick this" }).count();
  if (options !== 3) throw new Error(`expected 3 options, got ${options}`);
  const conflict = await page.getByText(/physics lab until 7pm/).count();
  await shot(page, "jordan-date-options");
  step(`negotiation: ${conflict ? "lab-until-7 conflict explained, " : ""}3 options`);
  await page.getByRole("button", { name: "Pick this" }).first().click();
  await page.getByText("Picked ✓").waitFor();

  await page.goto(`${base}/match/m_s01_s02/date?as=s01`);
  await page.getByText("Pick one").waitFor({ timeout: 30_000 });
  // Maya sees Jordan's pick and accepts it.
  const accept = page.getByRole("button", { name: "Accept their pick" });
  await accept.waitFor({ timeout: 20_000 });
  await shot(page, "maya-sees-their-pick");
  await accept.click();
  await page.getByText("It's a date").waitFor({ timeout: 20_000 });
  await shot(page, "booked");
  step("picks: same option on both sides → booked");

  // 6. Calendar file
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: /Add to calendar/ }).click()]);
  const file = path.join(out, download.suggestedFilename());
  await download.saveAs(file);
  const ics = fs.readFileSync(file, "utf8");
  if (!ics.includes("BEGIN:VCALENDAR") || !ics.includes("Prelude date")) throw new Error("bad .ics");
  step(`.ics downloaded: ${path.basename(file)}`);

  await browser.close();
  if (errors.length) {
    console.log(`\n⚠️ page errors:\n  ${errors.join("\n  ")}`);
    process.exitCode = 1;
  } else console.log(`\n✅ Full demo path passed at ${width}px. Screenshots in ${out}`);
}

main().catch((err) => {
  console.error(`\n❌ ${err.message ?? err}`);
  process.exit(1);
});
