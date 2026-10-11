// Full-page screenshots of the dashboard on a given assessment, for docs/evidence. Usage: node scripts/screenshots.mjs <assessment> <regress-assessment> <fix-cluster> <replay-cluster>
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const BASE = process.env.DASH_URL ?? "http://localhost:3000";
const [A, REG, FIX, REPLAY] = process.argv.slice(2);
const OUT = process.env.OUT ?? "../../docs/evidence";
const shots = [
  ["scorecard-full-23-to-0.jpg", `/a/${A}`],
  ["pipeline-full.jpg", `/a/${A}/pipeline`],
  ["clusters-full.jpg", `/a/${A}/clusters`],
  ["fix-detail-attempt2-after-failed-replay.jpg", `/a/${A}/fixes/${FIX}`],
  ["fix-detail-replay-20-of-20.jpg", `/a/${A}/fixes/${REPLAY}`],
  ["regression-suite-15.jpg", `/a/${A}/regressions`],
  ["regression-caught-4-blamed.jpg", `/a/${REG}/regressions`],
  ["cost-full.jpg", `/a/${A}/cost`],
];
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, colorScheme: "dark" });
const page = await ctx.newPage();
for (const [file, url] of shots) {
  await page.goto(BASE + url, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/${file}`, fullPage: true, type: "jpeg", quality: 82 });
  console.log("saved", file);
}
await browser.close();
