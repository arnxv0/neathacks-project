// Records real dashboard walkthrough clips with Playwright (installed Chrome), one webm per beat, into public/clips/.
import { chromium } from "playwright";
import { mkdirSync, readdirSync, renameSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.DASH_URL ?? "http://localhost:3000";
const P0 = process.env.P0_ASSESSMENT ?? "20261010-165007-7646";
const D1 = process.env.D1_ASSESSMENT ?? "20261010-154713-174a";
const REG = process.env.REGRESS_ASSESSMENT ?? "regress-20261010-172203-0cb4";
const FIX = process.env.FIX_CLUSTER ?? "b2-retry-5988d4";
const CLUSTER = process.env.CLUSTER ?? "b2-retry-5988d4";
const OUT = "public/clips";
const SIZE = { width: 1920, height: 1080 };

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function smoothScroll(page, px, step = 60, delay = 16) { for (let y = 0; y < px; y += step) { await page.mouse.wheel(0, step); await wait(delay); } }

const beats = [
  { name: "01-scorecard", url: `/a/${P0}`, run: async (p) => { await wait(3500); await smoothScroll(p, 500); await wait(2500); } },
  { name: "02-pipeline", url: `/a/${P0}/pipeline`, run: async (p) => { await wait(3500); await smoothScroll(p, 700); await wait(3000); } },
  { name: "03-clusters", url: `/a/${P0}/clusters`, run: async (p) => { await wait(3000); await p.click(`a[href$="/clusters/${CLUSTER}"]`); await wait(3500); await smoothScroll(p, 900); await wait(3000); } },
  { name: "04-fix", url: `/a/${P0}/fixes`, run: async (p) => { await wait(2500); await p.click(`a[href$="/fixes/${FIX}"]`); await wait(3500); await smoothScroll(p, 700); await wait(3000); } },
  { name: "05-replay-proof", url: `/a/${D1}/fixes/d1-watchlist-453a5d`, run: async (p) => { await wait(4000); await smoothScroll(p, 300); await wait(2000); } },
  { name: "06-regressions", url: `/a/${REG}/regressions`, run: async (p) => { await wait(4000); await smoothScroll(p, 300); await wait(2500); } },
  { name: "07-cost", url: `/a/${P0}/cost`, run: async (p) => { await wait(3500); await smoothScroll(p, 400); await wait(2500); } },
  { name: "08-before-after", url: `/a/${D1}`, run: async (p) => { await wait(4500); } },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--force-device-scale-factor=1"] });
for (const b of beats) {
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
