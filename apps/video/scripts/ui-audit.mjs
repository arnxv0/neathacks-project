// UI audit of the dashboard: full-page screenshots of every page at five viewports plus a layout report
// (horizontal overflow, clipped text, overlapping siblings in flex/grid rows).
// Usage: DASH_URL=http://localhost:3100 OUT=/tmp/ui-audit node scripts/ui-audit.mjs [assessment] [regress-assessment]
// Read-only: it only issues GETs. Exit code 1 when any defect is reported.
// Env: ONLY=scorecard,cost (page names) · WIDTHS=1920x1080,390x844 · SETTLE=ms to wait before the shot · MAX=issues printed per page.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.DASH_URL ?? "http://localhost:3100";
const API = process.env.API_URL ?? "http://localhost:8200";
const OUT = process.env.OUT ?? join(tmpdir(), "ui-audit");
const A = process.argv[2] ?? "20261011-001111-d070";
const REG = process.argv[3] ?? "regress-20261011-020324-9852";
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
const WIDTHS = (process.env.WIDTHS ?? "1920x1080,1440x900,1280x720,1024x768,390x844").split(",").map((s) => s.split("x").map(Number));

const summary = await fetch(`${API}/api/assessments/${A}`).then((r) => r.json());
const runId = summary.runs?.[0]?.run_id;
const pages = [
  ["scorecard", `/a/${A}`],
  ["pipeline", `/a/${A}/pipeline`],
  ["clusters", `/a/${A}/clusters`],
  ["cluster-detail", `/a/${A}/clusters/b1-b2-b3-honesty-retry-0af0c9`],
  ["fixes", `/a/${A}/fixes`],
  ["fix-detail-a6", `/a/${A}/fixes/a6-watchlist-0c3c1b`],
  ["fix-detail-b1", `/a/${A}/fixes/b1-b2-b3-honesty-retry-0af0c9`],
  ["regressions", `/a/${A}/regressions`],
  ["cost", `/a/${A}/cost`],
  ["run", `/a/${A}/runs/${runId}`],
  ["regress-caught", `/a/${REG}/regressions`],
].filter(([n]) => !ONLY || ONLY.includes(n));

/** Runs in the page. Returns a list of {kind, el, detail}. */
function audit() {
  const out = [];
  const vw = document.documentElement.clientWidth;
  const desc = (el) => {
    const cls = (el.getAttribute("class") ?? "").split(/\s+/).slice(0, 6).join(".");
    const txt = (el.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 50);
    return `<${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${cls ? "." + cls : ""}> "${txt}"`;
  };
  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 1.5 && r.height <= 1.5) return false; // sr-only
    return r.width > 0.5 && r.height > 0.5;
  };
  // Exempt: anything inside a deliberate scroll container (overflow auto/scroll).
  const inScroller = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (/(auto|scroll)/.test(s.overflowX) || /(auto|scroll)/.test(s.overflowY)) return true;
    }
    return false;
  };
  // Exempt: clipped by an ancestor that itself fits the viewport (the user never sees the part that sticks out).
  const clippedAway = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.overflowX !== "visible") { const pr = p.getBoundingClientRect(); if (pr.right <= vw + 1 && pr.left >= -1) return true; }
    }
    return false;
  };
  const decorative = (el) => !!el.closest("[aria-hidden='true'],[data-decorative],svg,canvas,nextjs-portal,[data-sonner-toaster]");

  // 1. page-level horizontal scroll
  const de = document.documentElement;
  if (de.scrollWidth > de.clientWidth + 1) out.push({ kind: "page-overflow-x", el: "html", detail: `scrollWidth ${de.scrollWidth} > clientWidth ${de.clientWidth}` });
  if (document.body.scrollWidth > document.body.clientWidth + 1) out.push({ kind: "body-overflow-x", el: "body", detail: `scrollWidth ${document.body.scrollWidth} > clientWidth ${document.body.clientWidth}` });

  const all = [...document.body.querySelectorAll("*")].filter((el) => !decorative(el) && visible(el));
  for (const el of all) {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    // 2. element sticks out of the viewport horizontally
    if ((r.right > vw + 1 || r.left < -1) && s.position !== "fixed" && !inScroller(el) && !clippedAway(el)) out.push({ kind: "outside-viewport", el: desc(el), detail: `left ${Math.round(r.left)} right ${Math.round(r.right)} vw ${vw}` });
    // 3. cards whose content is wider than the card: either it spills out (overflow visible) or real content is cut off (overflow hidden)
    if (el.matches("[data-slot='card'],[data-slot='card-content']")) {
      if (s.overflowX === "visible" && el.scrollWidth > el.clientWidth + 1) out.push({ kind: "card-overflow", el: desc(el), detail: `scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}` });
      if (s.overflowX === "hidden" || s.overflowX === "clip") {
        for (const k of el.querySelectorAll("*")) {
          if (decorative(k) || !visible(k) || k.children.length) continue;
          let scrolled = false;
          for (let p = k.parentElement; p && p !== el; p = p.parentElement) if (/(auto|scroll)/.test(getComputedStyle(p).overflowX)) scrolled = true;
          const kr = k.getBoundingClientRect();
          if (!scrolled && (kr.right > r.right + 1 || kr.left < r.left - 1)) { out.push({ kind: "content-cut-by-card", el: desc(k), detail: `${Math.round(kr.left)}..${Math.round(kr.right)} outside card ${Math.round(r.left)}..${Math.round(r.right)}` }); break; }
        }
      }
    }
    // 4. text clipped with no ellipsis: element with its own text and hidden overflow whose content does not fit
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (hasText && (s.overflowX === "hidden" || s.overflowX === "clip") && el.scrollWidth > el.clientWidth + 1 && s.textOverflow !== "ellipsis")
      out.push({ kind: "text-clipped", el: desc(el), detail: `scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}, no ellipsis` });
    if (hasText && (s.overflowY === "hidden" || s.overflowY === "clip") && el.scrollHeight > el.clientHeight + 2 && !/\d/.test(s.webkitLineClamp ?? "") && s.textOverflow !== "ellipsis")
      out.push({ kind: "text-clipped-y", el: desc(el), detail: `scrollHeight ${el.scrollHeight} > clientHeight ${el.clientHeight}` });
    // 5. overlapping siblings among the direct in-flow children of flex/grid containers
    if (/flex|grid/.test(s.display)) {
      const kids = [...el.children].filter((k) => { if (decorative(k) || !visible(k)) return false; const p = getComputedStyle(k).position; return p !== "absolute" && p !== "fixed" && p !== "sticky"; }); // sticky bars overlay their siblings on purpose
      for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
        const a = kids[i].getBoundingClientRect(), b = kids[j].getBoundingClientRect();
        const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (ox > 2 && oy > 2) out.push({ kind: "sibling-overlap", el: desc(kids[i]), detail: `overlaps ${desc(kids[j])} by ${Math.round(ox)}x${Math.round(oy)} in ${desc(el).slice(0, 80)}` });
      }
    }
    // 6. a child wider than its non-clipping flex/grid parent: it paints over the parent's neighbours
    const p = el.parentElement;
    if (p && p !== document.body) {
      const ps = getComputedStyle(p);
      if (/flex|grid/.test(ps.display) && ps.overflowX === "visible" && s.position !== "absolute" && s.position !== "fixed" && !inScroller(el) && !clippedAway(el)) {
        const pr = p.getBoundingClientRect();
        if (r.right > pr.right + 2 || r.left < pr.left - 2) out.push({ kind: "child-escapes-parent", el: desc(el), detail: `child ${Math.round(r.left)}..${Math.round(r.right)} parent ${Math.round(pr.left)}..${Math.round(pr.right)} (${desc(p).slice(0, 70)})` });
      }
    }
  }
  // 7. fixed chrome at the bottom covering the end of the content
  const main = document.querySelector("main");
  const last = main?.lastElementChild?.getBoundingClientRect();
  if (last) for (const el of all) {
    const s = getComputedStyle(el);
    if (s.position !== "fixed" || el.closest("[role='dialog']")) continue;
    const r = el.getBoundingClientRect();
    if (r.top > innerHeight / 2 && r.width > vw * 0.5 && last.bottom + scrollY > document.documentElement.scrollHeight - r.height + 1)
      out.push({ kind: "fixed-covers-content", el: desc(el), detail: `fixed bar ${Math.round(r.height)}px covers the end of main` });
  }
  const seen = new Set();
  return out.filter((o) => { const k = o.kind + o.el + o.detail; if (seen.has(k)) return false; seen.add(k); return true; });
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const report = {};
let total = 0;
for (const [w, h] of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, colorScheme: "dark", isMobile: w < 500, hasTouch: w < 500 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  for (const [name, url] of pages) {
    await page.goto(BASE + url, { waitUntil: "domcontentloaded" });
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
    await page.waitForSelector("main h1, main h2", { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(Number(process.env.SETTLE ?? 2500));
    await page.screenshot({ path: join(OUT, `${name}-${w}.png`), fullPage: true });
    const issues = await page.evaluate(audit);
    for (const e of errors.splice(0)) issues.push({ kind: "page-error", el: "window", detail: e });
    report[`${name}@${w}`] = issues;
    total += issues.length;
    console.log(`${issues.length ? "FAIL" : "ok  "} ${name}@${w}${issues.length ? ` (${issues.length})` : ""}`);
    for (const i of issues.slice(0, Number(process.env.MAX ?? 12))) console.log(`     ${i.kind}: ${i.el} — ${i.detail}`);
  }
  await ctx.close();
}
await browser.close();
writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2));
console.log(`\n${total} issue(s) across ${Object.keys(report).length} page×width combinations. Screenshots + report.json in ${OUT}`);
process.exit(total ? 1 : 0);
