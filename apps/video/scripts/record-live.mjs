// Records one continuous take of a live assessment: start it, watch the Pipeline screen, approve a fix from the UI,
// approve the rest through the API, then land on the finished scorecard. Writes public/live/live.webm + marks.json
// (seconds into the take for each stage change, so the edit can speed up the waiting and keep the moments real-time).
import { chromium } from "playwright";
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.DASH_URL ?? "http://localhost:3000";
const API = process.env.API_URL ?? "http://localhost:8200";
const ATTACKS = process.env.LIVE_ATTACKS ?? "D1";
const SEEDS = Number(process.env.LIVE_SEEDS ?? 3);
const OUT = "public/live";
const SIZE = { width: 1920, height: 1080 };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (p) => (await fetch(API + p)).json();
const post = async (p, body) => (await fetch(API + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) })).json();

async function until(pred, label, timeoutMs = 40 * 60_000) {
  const t = Date.now();
  for (;;) {
    const v = await pred();
    if (v) return v;
    if (Date.now() - t > timeoutMs) throw new Error(`timed out waiting for ${label}`);
    await wait(2000);
  }
}

rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--force-device-scale-factor=1"] });
const ctx = await browser.newContext({ viewport: SIZE, deviceScaleFactor: 1, recordVideo: { dir: join(OUT, "_tmp"), size: SIZE }, colorScheme: "dark" });
const page = await ctx.newPage();
const t0 = Date.now();
const marks = {};
const mark = (k) => { marks[k] = (Date.now() - t0) / 1000; console.log(k, marks[k].toFixed(1)); };
const hideOverlay = () => page.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});

const body = { attacks: ATTACKS, seeds: SEEDS, mode: "dev" };
if (process.env.TARGET_DIR) body.target_dir = process.env.TARGET_DIR;
const { assessment_id: aid } = await post("/api/assessments", body);
if (!aid) throw new Error("assessment did not start; see ledger-live/api-jobs.log");
console.log("assessment", aid);
const summary = () => get(`/api/assessments/${aid}`);
const state = async () => (await summary()).manifest?.state;

await page.goto(`${BASE}/a/${aid}/pipeline`, { waitUntil: "networkidle" }); await hideOverlay();
mark("pipeline");
let last = null;
const s = await until(async () => {
  const cur = await summary(), st = cur.manifest?.state;
  if (st && st !== last) { mark(`state:${st}`); last = st; }
  if (st === "DONE" || st === "STOPPED") throw new Error(`run ended in ${st} before any fix was ready to approve`);
  return st === "AWAIT_APPROVAL" && cur.clusters.some((c) => c.status === "await_approval") ? cur : null;
}, "fixes ready to approve");

// The on-camera approval: open the first fix, let the replay proof and diff read, click Approve.
const ready = s.clusters.filter((c) => c.status === "await_approval");
await page.goto(`${BASE}/a/${aid}/fixes/${ready[0].cluster_id}`, { waitUntil: "networkidle" }); await hideOverlay();
mark("fix-detail"); await wait(5000);
await page.getByRole("button", { name: /Approve/ }).click();
mark("approve-click"); await wait(4000);
for (const c of ready.slice(1)) await post(`/api/assessments/${aid}/clusters/${c.cluster_id}/approve`);

await page.goto(`${BASE}/a/${aid}/pipeline`, { waitUntil: "networkidle" }); await hideOverlay();
mark("pipeline-after-approve");
// A cluster left for a human (needs_human) keeps the run from finishing on its own; stop watching after 15 minutes.
await until(async () => { const st = await state(); if (st !== last) { mark(`state:${st}`); last = st; } return st === "DONE"; }, "DONE", 15 * 60_000)
  .catch((e) => console.warn(e.message, "- recording the scorecard as it stands"));
await wait(3000);
await page.goto(`${BASE}/a/${aid}`, { waitUntil: "networkidle" }); await hideOverlay();
mark("scorecard"); await wait(6000);
mark("end");

await ctx.close(); await browser.close();
const tmp = join(OUT, "_tmp"), file = readdirSync(tmp).find((f) => f.endsWith(".webm"));
renameSync(join(tmp, file), join(OUT, "live.webm")); rmSync(tmp, { recursive: true, force: true });
writeFileSync(join(OUT, "marks.json"), JSON.stringify({ assessment_id: aid, ...marks }, null, 2));
console.log("wrote", join(OUT, "live.webm"));
