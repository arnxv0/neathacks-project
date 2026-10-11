// Records real dashboard walkthrough clips with Playwright (installed Chrome), one webm per beat, into public/clips/.
// Defaults are the 2026-10-11 full run (P0 = D1 = the full assessment; REG = the regression beat on the fixed main; FIX = A6, failed replay then 10/10).
import { chromium } from "playwright";
import { mkdirSync, readdirSync, renameSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.DASH_URL ?? "http://localhost:3000";
const P0 = process.env.P0_ASSESSMENT ?? "20261011-001111-d070";
const D1 = process.env.D1_ASSESSMENT ?? "20261011-001111-d070";
const REG = process.env.REGRESS_ASSESSMENT ?? "regress-20261011-020324-9852";
const FIX = process.env.FIX_CLUSTER ?? "a6-watchlist-0c3c1b";
const CLUSTER = process.env.CLUSTER ?? "b1-b2-b3-honesty-retry-0af0c9";
const REPLAY_CLUSTER = process.env.REPLAY_CLUSTER ?? "b1-b2-b3-honesty-retry-0af0c9";
const OUT = "public/clips";
const SIZE = { width: 1920, height: 1080 };

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function smoothScroll(page, px, step = 60, delay = 16) { for (let y = 0; y < px; y += step) { await page.mouse.wheel(0, step); await wait(delay); } }

const beats = [
  { name: "01-scorecard", url: `/a/${P0}`, run: async (p) => { await wait(4500); await smoothScroll(p, 350); await wait(5000); await smoothScroll(p, 350); await wait(5000); await smoothScroll(p, 300); await wait(3500); } },
  { name: "02-pipeline", url: `/a/${P0}/pipeline`, run: async (p) => { await wait(4000); await smoothScroll(p, 400); await wait(4500); await smoothScroll(p, 400); await wait(5000); } },
  { name: "03-clusters", url: `/a/${P0}/clusters`, run: async (p) => { await wait(3000); await p.click(`a[href$="/clusters/${CLUSTER}"]`); await wait(4000); await smoothScroll(p, 500); await wait(3000); await smoothScroll(p, 400); await wait(3000); } },
  { name: "04-fix", url: `/a/${P0}/fixes`, run: async (p) => { await wait(3000); await p.click(`a[href$="/fixes/${FIX}"]`); await wait(8500); await smoothScroll(p, 400); await wait(6500); await smoothScroll(p, 400); await wait(6000); } },
  { name: "05-replay-proof", url: `/a/${D1}/fixes/${REPLAY_CLUSTER}`, run: async (p) => { await wait(5000); await smoothScroll(p, 300); await wait(5500); } },
  { name: "06-regressions", url: `/a/${REG}/regressions`, run: async (p) => { await wait(5000); await smoothScroll(p, 300); await wait(5500); } },
  { name: "07-cost", url: `/a/${P0}/cost`, run: async (p) => { await wait(5000); await smoothScroll(p, 400); await wait(5000); await smoothScroll(p, 200); await wait(5500); } },
  { name: "08-before-after", url: `/a/${D1}`, run: async (p) => { await wait(8000); await smoothScroll(p, 350); await wait(6500); await smoothScroll(p, 350); await wait(6000); } },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--force-device-scale-factor=1"] });
// ONLY=01-scorecard,08-before-after re-records just those beats
const only = process.env.ONLY ? process.env.ONLY.split(",") : null;
for (const b of beats.filter((x) => !only || only.includes(x.name))) {
  const tmp = join(OUT, `_tmp_${b.name}`); rmSync(tmp, { recursive: true, force: true });
  const ctx = await browser.newContext({ viewport: SIZE, deviceScaleFactor: 1, recordVideo: { dir: tmp, size: SIZE }, colorScheme: "dark" });
  const page = await ctx.newPage();
  await page.goto(BASE + b.url, { waitUntil: "networkidle" });
  // hide Next.js dev overlay badge
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
  await b.run(page);
  await ctx.close();
  const file = readdirSync(tmp).find((f) => f.endsWith(".webm"));
  const dest = join(OUT, `${b.name}.webm`);
  if (existsSync(dest)) rmSync(dest);
  renameSync(join(tmp, file), dest); rmSync(tmp, { recursive: true, force: true });
  console.log("recorded", dest);
}
await browser.close();
