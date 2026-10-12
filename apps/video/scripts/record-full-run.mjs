// Records a FULL assessment that is already running, on the dashboard, as a series of segment files (a new browser
// context every few minutes, so a crash loses at most one segment). It watches the pipeline while fixers work, reviews
// and approves on screen every fix that passed replay (one at a time, waiting for the merge or the conflict path to
// finish), resumes the run once if the wall-clock cap stops it, and ends with a tour of the result pages.
// Usage: node scripts/record-full-run.mjs <assessment_id> <outdir>     (DASH_URL / API_URL default to localhost)
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, readdirSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const [, , AID, OUT = "public/clips/full-run"] = process.argv;
const BASE = process.env.DASH_URL ?? "http://localhost:3000", API = process.env.API_URL ?? "http://localhost:8200";
const SIZE = { width: 1920, height: 1080 }, SEGMENT_MS = 6 * 60_000, MAX_MS = Number(process.env.MAX_MIN ?? 150) * 60_000;
mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now(); const markers = existsSync(join(OUT, "markers.json")) ? [] : [];
let seg = 0, segStart = 0, ctx, page;
const mark = (name, extra = {}) => { markers.push({ name, t: Date.now() - t0, seg, tseg: Date.now() - segStart, wall: new Date().toISOString(), ...extra }); console.log(new Date().toTimeString().slice(0, 8), `seg${seg}`, name, JSON.stringify(extra)); writeFileSync(join(OUT, "markers.json"), JSON.stringify(markers, null, 1)); };
const get = async (p) => { try { const r = await fetch(API + p); return r.ok ? await r.json() : null; } catch { return null; } };
const summary = () => get(`/api/assessments/${AID}`);
const history = async () => { const h = await get(`/api/assessments/${AID}/events/history`); return Array.isArray(h) ? h : h?.events ?? []; };

const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--force-device-scale-factor=1"] });
async function openSegment(path) {
  if (ctx) await closeSegment();
  seg += 1; segStart = Date.now();
  ctx = await browser.newContext({ viewport: SIZE, deviceScaleFactor: 1, recordVideo: { dir: join(OUT, `_seg${seg}`), size: SIZE }, colorScheme: "dark" });
  await ctx.addInitScript(() => { const s = document.createElement("style"); s.textContent = "nextjs-portal{display:none!important}"; document.addEventListener("DOMContentLoaded", () => document.head.appendChild(s)); });
  page = await ctx.newPage();
  await page.goto(BASE + path, { waitUntil: "domcontentloaded" }); await wait(3500); mark("segment-open", { path });
}
async function closeSegment() {
  const n = seg; await ctx.close().catch(() => {}); ctx = null;
  const dir = join(OUT, `_seg${n}`); const f = existsSync(dir) ? readdirSync(dir).find((x) => x.endsWith(".webm")) : null;
  if (f) renameSync(join(dir, f), join(OUT, `seg-${String(n).padStart(2, "0")}.webm`));
}
const rotate = async (path) => { if (Date.now() - segStart > SEGMENT_MS) await openSegment(path); };
async function smoothScroll(px, step = 40, delay = 16) { const d = Math.sign(px); for (let y = 0; y < Math.abs(px); y += step) { await page.mouse.wheel(0, d * step); await wait(delay); } }
async function glide(loc) { const b = await loc.boundingBox().catch(() => null); if (b) await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 25 }); await wait(400); }
async function nav(label) { const l = page.locator("aside nav a", { hasText: label }).first(); try { await glide(l); await l.click({ timeout: 8000 }); } catch { await page.goto(`${BASE}/a/${AID}${{ Pipeline: "/pipeline", Fixes: "/fixes", "Root causes": "/clusters", "Regression tests": "/regressions", Cost: "/cost", Scorecard: "" }[label] ?? ""}`); } await wait(2500); mark("nav", { label }); }

let resumed = 0; const reviewed = new Set(); let detailed = 0;
async function approveOne(c) {
  await rotate(`/a/${AID}/fixes`);
  if (!page.url().endsWith("/fixes")) await nav("Fixes");
  await wait(2500);
  const link = page.locator(`a[href$="/fixes/${c.cluster_id}"]`).first();
  await link.scrollIntoViewIfNeeded().catch(() => {}); await glide(link); await link.click(); mark("fix-detail", { cid: c.cluster_id });
  const deep = detailed < 3; detailed += 1;      // the first three reviews are slow enough to read; the rest are brisk
  await wait(deep ? 7000 : 3500); await smoothScroll(500); await wait(deep ? 7000 : 2500); await smoothScroll(500); await wait(deep ? 6000 : 2000);
  if (deep) { await smoothScroll(500); await wait(5000); }
  await smoothScroll(-2000, 100); await wait(1500);
  const before = (await history()).length;
  const btn = page.getByRole("button", { name: /Approve & merge/ }).first();
  if (!(await btn.isEnabled().catch(() => false))) { mark("approve-disabled", { cid: c.cluster_id }); return; }
  await glide(btn); await btn.click(); mark("approve-clicked", { cid: c.cluster_id });
  // wait for the outcome of THIS approval: merged, needs a human, or sent back and waiting for approval again
  const end = Date.now() + 20 * 60_000; let outcome = "timeout";
  while (Date.now() < end) {
    const ev = (await history()).slice(before).filter((e) => e.cluster_id === c.cluster_id);
    const hit = ev.find((e) => ["merged", "cluster.needs_human", "approval.needed"].includes(e.type));
    if (hit) { outcome = hit.type === "merged" ? (hit.merged === false ? "closed_by_main" : "merged") : hit.type; break; }
    if (ev.some((e) => e.type === "recovery") && !page.url().includes("/pipeline")) { await nav("Pipeline"); }   // a conflict: watch the fixer resolve it
    await wait(3000);
  }
  mark("approval-outcome", { cid: c.cluster_id, outcome }); await wait(4000);
  if (outcome !== "approval.needed") reviewed.add(c.cluster_id);
}

await openSegment(`/a/${AID}/pipeline`);
let flip = 0, lastState = "";
while (Date.now() - t0 < MAX_MS) {
  const s = await summary(); if (!s) { await wait(3000); continue; }
  const st = s.manifest.state; if (st !== lastState) { mark("state", { state: st }); lastState = st; }
  if (st === "DONE") break;
  if (st === "STOPPED" && resumed < 3) { resumed += 1; mark("resume", { n: resumed }); spawn("uv", ["run", "preflight", "resume", AID], { cwd: "../..", detached: true, stdio: "ignore" }).unref(); await wait(15000); continue; }
  const pending = s.clusters.filter((c) => c.status === "await_approval" && c.attempts.some((a) => a.status === "passed"));
  const busy = s.clusters.some((c) => ["open", "fixing", "replaying"].includes(c.status)) || ["FIX", "ATTACK", "GRADE", "CLUSTER", "DIVERGE", "REGRESSION_SUITE", "VERIFY_AFTER", "REPORT"].includes(st);
  if (st === "AWAIT_APPROVAL" && pending.length) { await approveOne(pending[0]); continue; }
  if (st === "AWAIT_APPROVAL" && !pending.length && !busy) { mark("nothing-to-approve", { statuses: s.clusters.map((c) => `${c.cluster_id}:${c.status}`) }); break; }
  // otherwise: watch. Alternate pipeline and fixes every ~45 s so both views are on tape.
  await rotate(`/a/${AID}/pipeline`);
  if (++flip % 15 === 0) { await nav((flip / 15) % 2 ? "Fixes" : "Pipeline"); if ((flip / 15) % 2 === 0) { await wait(1500); await smoothScroll(450); await wait(4000); await smoothScroll(-450); } }
  await wait(3000);
}
// closing tour
await openSegment(`/a/${AID}`); mark("tour-scorecard"); await wait(7000); await smoothScroll(500); await wait(7000); await smoothScroll(600); await wait(6000);
await nav("Pipeline"); await wait(6000); await smoothScroll(500); await wait(5000);
await nav("Root causes"); await wait(6000); await smoothScroll(600); await wait(5000);
await nav("Fixes"); await wait(6000); await smoothScroll(600); await wait(5000);
await nav("Regression tests"); await wait(8000);
await nav("Cost"); await wait(8000); await smoothScroll(400); await wait(5000);
await nav("Scorecard"); await wait(8000); mark("end");
await closeSegment(); await browser.close(); console.log("done", OUT);
