// Records ONE continuous take of a live run on a deployed Preflight dashboard: reset -> run -> clusters -> fixers ->
// review -> approve -> regression + after-pass. Writes the webm and a markers.json (ms offsets) so the waits can be
// sped up in the edit. Usage: DASH_URL=https://host DASH_USER=judge DASH_PASS=... node scripts/record-live-fix.mjs <outdir>
import { chromium } from "playwright";
import { mkdirSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.DASH_URL ?? "http://localhost:3000";
const AUTH = process.env.DASH_USER ? { username: process.env.DASH_USER, password: process.env.DASH_PASS ?? "" } : undefined;
const OUT = process.argv[2] ?? "public/clips/live-fix";
const SIZE = { width: 1920, height: 1080 };
const MAX_MIN = Number(process.env.MAX_MIN ?? 30);
mkdirSync(OUT, { recursive: true });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now(); const markers = [];
const mark = (name, extra = {}) => { markers.push({ name, t: Date.now() - t0, ...extra }); console.log(((Date.now() - t0) / 1000).toFixed(1).padStart(7), name, JSON.stringify(extra)); writeFileSync(join(OUT, "markers.json"), JSON.stringify(markers, null, 1)); };
async function smoothScroll(page, px, step = 40, delay = 16) { const dir = Math.sign(px); for (let y = 0; y < Math.abs(px); y += step) { await page.mouse.wheel(0, dir * step); await wait(delay); } }
async function glide(page, loc) { const b = await loc.boundingBox(); if (b) await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 25 }); await wait(500); }

const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--force-device-scale-factor=1"] });
const ctx = await browser.newContext({ viewport: SIZE, deviceScaleFactor: 1, recordVideo: { dir: OUT, size: SIZE }, colorScheme: "dark", httpCredentials: AUTH });
const page = await ctx.newPage();
const apiGet = async (p) => { const r = await ctx.request.get(BASE + p); return r.ok() ? r.json() : null; };
const nav = async (label) => { const l = page.locator("aside nav a", { hasText: label }).first(); await glide(page, l); await l.click(); await wait(2500); };
try {
  await page.goto(BASE + "/", { waitUntil: "networkidle" }); await wait(4000); mark("open");
  // 1. fresh instance
  const resetBtn = page.getByRole("button", { name: "Reset demo" }).first();
  await glide(page, resetBtn); await resetBtn.click(); await wait(3500); mark("reset-dialog");
  const confirm = page.getByRole("dialog").getByRole("button", { name: "Reset demo" });
  await glide(page, confirm); await confirm.click(); mark("reset-confirmed");
  await page.getByRole("button", { name: "Run an assessment" }).waitFor({ timeout: 60000 }); await wait(5000); mark("landing");
  // 2. run
  const run = page.getByRole("button", { name: "Run an assessment" });
  await glide(page, run); await run.click(); mark("run-clicked");
  await page.waitForURL(/\/a\/\d{8}-/, { timeout: 60000 });
  const aid = page.url().split("/a/")[1].split(/[/?#]/)[0]; mark("assessment", { aid }); await wait(5000);
  await nav("Pipeline"); mark("pipeline");
  const summary = () => apiGet(`/api/assessments/${aid}`);
  const state = async () => (await summary())?.manifest?.state;
  const until = async (pred, label, tick) => { const end = Date.now() + MAX_MIN * 60000; let i = 0; for (;;) { const s = await summary(); if (s && pred(s)) { mark(label, { state: s.manifest.state }); return s; } if (Date.now() > end) throw new Error("timeout waiting for " + label); await tick?.(i++, s); await wait(3000); } };
  // 3. attack -> clusters
  let s = await until((x) => (x.clusters?.length ?? 0) > 0 || ["DONE", "FAILED", "STOPPED"].includes(x.manifest.state), "clusters-found");
  if (!s.clusters?.length) throw new Error("no clusters: the attack did not land this time");
  await wait(4000); await nav("Clusters"); mark("clusters-page"); await wait(4000);
  const cid0 = s.clusters[0].cluster_id;
  const cl = page.locator(`a[href$="/clusters/${cid0}"]`).first(); await glide(page, cl); await cl.click(); mark("cluster-detail", { cid: cid0 });
  await wait(5000); await smoothScroll(page, 500); await wait(6000); await smoothScroll(page, 500); await wait(6000); await smoothScroll(page, 400); await wait(5000); mark("cluster-detail-end");
  // 4. fixers at work: alternate fixes list and pipeline until every cluster is waiting for a human (or settled)
  const settled = (x) => x.manifest.state === "AWAIT_APPROVAL" || ["DONE", "REPORT", "FAILED", "STOPPED"].includes(x.manifest.state);
  await nav("Fixes"); mark("fixes-live");
  s = await until(settled, "await-approval", async (i) => { if (i > 0 && i % 14 === 0) { await nav((i / 14) % 2 ? "Pipeline" : "Fixes"); mark((i / 14) % 2 ? "pipeline-live" : "fixes-live"); } });
  if (s.manifest.state !== "AWAIT_APPROVAL") throw new Error("run ended in " + s.manifest.state);
  await wait(3000); await nav("Fixes"); mark("fixes-ready"); await wait(5000);
  // 5. review and approve each fix that passed its replay
  const pending = s.clusters.filter((c) => c.status === "await_approval");
  for (const [k, c] of pending.entries()) {
    const link = page.locator(`a[href$="/fixes/${c.cluster_id}"]`).first(); await glide(page, link); await link.click(); mark("fix-detail", { cid: c.cluster_id });
    await wait(7000); await smoothScroll(page, 450); await wait(k ? 4000 : 8000); await smoothScroll(page, 450); await wait(k ? 4000 : 8000); await smoothScroll(page, 500); await wait(k ? 3000 : 6000);
    await smoothScroll(page, -1600, 80); await wait(2000);
    const approve = page.getByRole("button", { name: /Approve & merge/ }).first();
    await glide(page, approve); mark("approve-hover", { cid: c.cluster_id }); await approve.click(); mark("approve-clicked", { cid: c.cluster_id });
    await until((x) => x.clusters.find((y) => y.cluster_id === c.cluster_id)?.status !== "await_approval", "approved", undefined); await wait(6000);
    if (k < pending.length - 1) { await nav("Fixes"); await wait(3000); }
  }
  // 6. regression suite + after-pass
  await nav("Pipeline"); mark("pipeline-after");
  await until((x) => ["DONE", "FAILED", "STOPPED"].includes(x.manifest.state), "done", async (i) => { if (i === 6) await smoothScroll(page, 500); });
  await wait(5000); await nav("Regressions"); mark("regressions"); await wait(8000);
  await nav("Scorecard"); mark("scorecard"); await wait(6000); await smoothScroll(page, 400); await wait(7000); mark("end");
} catch (e) { mark("error", { message: String(e).slice(0, 300) }); await page.screenshot({ path: join(OUT, "error.png") }).catch(() => {}); }
await ctx.close(); await browser.close();
const f = readdirSync(OUT).find((x) => x.endsWith(".webm") && x !== "take.webm"); if (f) renameSync(join(OUT, f), join(OUT, "take.webm"));
console.log("saved", join(OUT, "take.webm"));
