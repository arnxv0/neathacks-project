"use client";
import { useMemo } from "react";
import { headlineAttempt } from "../fixes";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { Card, CardContent } from "@/components/ui/card";
import { BorderBeam } from "@/components/ui/border-beam";
import { cn } from "@/lib/utils";
import type { PreflightEvent, SkippedAttack, Summary } from "@/lib/api/types";
import { Check, Radio, Wrench } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CARD_LINK, Disclosure, EASE, EmptyState, Mono, PANEL, PANEL_LINK, Stagger, StaggerItem, StatusBadge, clusterStatus, Tone } from "../shared";
import { ReplayDots } from "../fixes";
import { timeAgo } from "@/lib/format";

export const STAGES = [
  { id: "BOOT_TARGET", label: "Boot", hint: "target + chaos proxy" },
  { id: "VERIFY_OWNERSHIP", label: "Verify", hint: "ownership token" },
  { id: "ATTACK", label: "Attack", hint: "seeds × personas × faults" },
  { id: "GRADE", label: "Grade", hint: "deterministic graders, judge" },
  { id: "CLUSTER", label: "Cluster", hint: "signature → root cause" },
  { id: "DIVERGE", label: "Diverge", hint: "first bad step + neatlogs" },
  { id: "FIX", label: "Fix", hint: "Claude Code × N, Entire" },
  { id: "AWAIT_APPROVAL", label: "Review", hint: "human approves" },
  { id: "REGRESSION_SUITE", label: "Regress", hint: "every past fix" },
  { id: "VERIFY_AFTER", label: "After", hint: "same seeds, merged main" },
  { id: "DONE", label: "Done", hint: "report + cost" },
];
const ORDER = STAGES.map((s) => s.id);
const stageIndex = (state: string) => { const i = ORDER.indexOf(state === "REPORT" ? "VERIFY_AFTER" : state === "INIT" ? "BOOT_TARGET" : state === "STOPPED" ? "DONE" : state); return i < 0 ? 0 : i; };

export function StageTrack({ state, counts }: { state: string; counts: Record<string, string | number | undefined> }) {
  const cur = stageIndex(state);
  const done = state === "DONE" || state === "STOPPED";
  const progress = (done ? ORDER.length - 1 : cur) / (ORDER.length - 1);
  // The connector runs from the centre of the first circle to the centre of the last one: half a column in from each side.
  const inset = `${100 / (STAGES.length * 2)}%`;
  return (
    <div className="scroll-thin -mx-2 overflow-x-auto px-2 pb-1" tabIndex={0} role="group" aria-label="Pipeline stages">
      <div className="relative min-w-[760px]">
        <div aria-hidden className="absolute top-[22px] h-px bg-border" style={{ left: inset, right: inset }}>
          <motion.div className="h-px origin-left bg-gradient-to-r from-primary via-trace to-pass" initial={{ scaleX: 0 }} animate={{ scaleX: progress }} transition={{ duration: 0.7, ease: EASE }} />
        </div>
        <ol className="relative grid" style={{ gridTemplateColumns: `repeat(${STAGES.length}, minmax(0, 1fr))` }}>
          {STAGES.map((s, i) => {
            const status = done && i <= cur ? "done" : i < cur ? "done" : i === cur ? "active" : "todo";
            return (
              <motion.li key={s.id} aria-current={status === "active" ? "step" : undefined} className="flex min-w-0 flex-col items-center px-1 text-center"
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: EASE, delay: i * 0.04 }}>
                <div className={cn("z-10 flex size-11 items-center justify-center rounded-full border bg-background mono text-[11px] transition-colors duration-200",
                  status === "done" && "border-pass bg-pass/10 text-pass", status === "active" && "pulse-ring border-primary text-primary", status === "todo" && "border-border text-muted-foreground")}>
                  {status === "done" ? <Check aria-label="done" className="size-4" /> : i + 1}
                </div>
                <p className={cn("mt-2 text-xs font-medium", status === "todo" ? "text-muted-foreground" : "text-foreground")}>{s.label}</p>
                <p className="hidden text-[10px] leading-tight text-balance text-muted-foreground tabular-nums xl:block">{counts[s.id] ?? s.hint}</p>
              </motion.li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

type Row = { key: string; ts: number; kind: "run" | "cluster" | "fix" | "replay" | "state" | "recovery" | "merged" | "regression"; tone: "pass" | "fail" | "pending" | "trace" | "checkpoint" | "muted"; text: string; sub?: string; href?: string };

/** `closedByMain`: clusters whose branch was not merged (the API's `resolution`); their "merged" event must not claim a merge. */
export function eventsToRows(events: PreflightEvent[], id: string, attacks: Summary["attacks"], closedByMain?: Set<string>): Row[] {
  const rows: Row[] = [];
  for (const e of events) {
    const base = `/a/${id}`;
    switch (e.type) {
      case "run.started": rows.push({ key: `rs-${e.seq}`, ts: e.ts, kind: "run", tone: "muted", text: `${e.attack_id} · ${e.seed_id}`, sub: e.kind === "after" ? "after-pass started" : "attacking…", href: `${base}/runs/${e.run_id}` }); break;
      case "run.graded": rows.push({ key: `rg-${e.seq}`, ts: e.ts, kind: "run", tone: e.failed ? "fail" : "pass", text: `${e.attack_id}${e.kind === "after" ? " (after)" : ""} · ${attacks[e.attack_id]?.name ?? ""}`, sub: e.failed ? `attack succeeded · ${(e.failing_graders ?? []).join(", ")}` : "attack blocked", href: `${base}/runs/${e.run_id}` }); break;
      case "cluster.created": rows.push({ key: `c-${e.seq}`, ts: e.ts, kind: "cluster", tone: "trace", text: `cluster ${e.cluster_id}`, sub: `${(e.run_ids ?? []).length} runs · ${(e.failing_graders ?? []).join(", ")}`, href: `${base}/clusters/${e.cluster_id}` }); break;
      case "cluster.merged": rows.push({ key: `cm-${e.seq}`, ts: e.ts, kind: "cluster", tone: "trace", text: `analyst merged ${(e.absorbed ?? []).length} cluster(s) into ${e.cluster_id}`, sub: e.reason }); break;
      case "divergence.ready": rows.push({ key: `d-${e.seq}`, ts: e.ts, kind: "cluster", tone: "trace", text: `divergence at step ${e.step_index} · ${e.cluster_id}`, sub: e.hypothesis, href: `${base}/clusters/${e.cluster_id}` }); break;
      case "fix.started": rows.push({ key: `f-${e.seq}`, ts: e.ts, kind: "fix", tone: "pending", text: `fixer #${e.attempt} started · ${e.cluster_id}`, sub: `${e.backend}${e.resumed ? " · resumed" : ""}`, href: `${base}/fixes/${e.cluster_id}` }); break;
      case "fix.attempt.done": rows.push({ key: `fd-${e.seq}`, ts: e.ts, kind: "fix", tone: e.ok ? "checkpoint" : "fail", text: e.ok ? `fix committed ${String(e.commit).slice(0, 8)} · ${e.cluster_id}` : `fixer failed · ${e.cluster_id}`, sub: e.ok ? `tests ${e.tests_green ? "green" : "red"}${e.checkpoint ? ` · checkpoint ${e.checkpoint}` : ""}` : String(e.error ?? ""), href: `${base}/fixes/${e.cluster_id}` }); break;
      case "replay.done": rows.push({ key: `r-${e.seq}`, ts: e.ts, kind: "replay", tone: e.before !== e.after && String(e.after).split("/")[0] === String(e.after).split("/")[1] ? "pass" : "pending", text: `replay ${e.before} → ${e.after} · ${e.cluster_id}`, href: `${base}/fixes/${e.cluster_id}` }); break;
      case "approval.needed": rows.push({ key: `a-${e.seq}`, ts: e.ts, kind: "fix", tone: "pending", text: `ready for review · ${e.cluster_id}`, sub: "approve, request changes, edit or reject", href: `${base}/fixes/${e.cluster_id}` }); break;
      case "merged": rows.push({ key: `m-${e.seq}`, ts: e.ts, kind: "merged", tone: "pass", text: e.merged === false || (e.merged === undefined && closedByMain?.has(e.cluster_id as string)) ? `closed by main, branch not merged · ${e.cluster_id}` : `merged into main · ${e.cluster_id}`, sub: `regression test saved`, href: `${base}/regressions` }); break;
      case "regression.result": rows.push({ key: `reg-${e.seq}`, ts: e.ts, kind: "regression", tone: e.passed ? "pass" : "fail", text: `${e.passed ? "holding" : "REGRESSED"} · ${e.cluster_id}`, href: `${base}/regressions` }); break;
      case "recovery": rows.push({ key: `rec-${e.seq}`, ts: e.ts, kind: "recovery", tone: "pending", text: `recovered: ${e.kind}`, sub: e.detail }); break;
      case "state.changed": rows.push({ key: `s-${e.seq}`, ts: e.ts, kind: "state", tone: "muted", text: `→ ${e.state}` }); break;
      case "stopped": rows.push({ key: `st-${e.seq}`, ts: e.ts, kind: "state", tone: "fail", text: `stopped: ${e.reason}` }); break;
    }
  }
  return rows;
}

const DOT: Record<Row["tone"], string> = { fail: "bg-fail", pass: "bg-pass", pending: "bg-pending", trace: "bg-trace", checkpoint: "bg-checkpoint", muted: "bg-muted-foreground/50" };
const EDGE: Record<Row["tone"], string> = { fail: "border-fail/40", pass: "border-pass/30", pending: "border-pending/40", trace: "border-trace/40", checkpoint: "border-checkpoint/40", muted: "border-border/60" };

export function LiveFeed({ rows }: { rows: Row[] }) {
  const shown = [...rows].reverse().slice(0, 40);
  if (!shown.length) return <EmptyState icon={Radio} title="No events yet" hint="Events appear here the moment the assessment writes them to the ledger." />;
  return (
    <ol className="space-y-1.5">
      <AnimatePresence initial={false}>
        {shown.map((r) => (
          <motion.li key={r.key} layout="position" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2, ease: EASE }}
            className={cn("flex items-center gap-2.5 rounded-lg border bg-card/70 px-3 py-2 text-xs transition-colors duration-200 sm:gap-3", EDGE[r.tone])}>
            <span aria-hidden className={cn("size-2 shrink-0 rounded-full", DOT[r.tone])} />
            <Mono className="hidden w-[4.5rem] shrink-0 text-[10px] uppercase sm:block">{r.kind}</Mono>
            <div className="min-w-0 flex-1">
              {r.href ? <Link href={r.href} className="block truncate rounded-sm hover:underline">{r.text}</Link> : <span className="block truncate">{r.text}</span>}
              {r.sub && <p className="truncate text-muted-foreground">{r.sub}</p>}
            </div>
            <Mono className="shrink-0 whitespace-nowrap">{timeAgo(r.ts)}</Mono>
          </motion.li>
        ))}
      </AnimatePresence>
    </ol>
  );
}

export function AttackProgress({ s }: { s: Summary }) {
  const total = Object.values(s.attacks).filter((a) => a.tier === "P0").length;
  const planned = s.manifest?.attacks;
  const runs = s.runs.filter((r) => r.kind === "attack");
  const byAttack = new Map<string, { n: number; fail: number }>();
  for (const r of runs) { const v = byAttack.get(r.attack_id) ?? { n: 0, fail: 0 }; v.n++; if (r.failed) v.fail++; byAttack.set(r.attack_id, v); }
  const ids = Object.keys(s.attacks).filter((k) => s.attacks[k].tier === "P0").sort();
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1"><h2 className="text-sm font-medium">Attack matrix</h2><Mono>{byAttack.size}/{planned && planned !== "P0" ? planned.split(",").length : total} attacks run · {runs.filter((r) => r.failed).length} succeeded</Mono></div>
      <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-10 2xl:grid-cols-20">
        {ids.map((id) => { const v = byAttack.get(id); return (
          <Tooltip key={id}>
            <TooltipTrigger render={<motion.div tabIndex={0} animate={v ? { scale: [1, 1.06, 1] } : {}} transition={{ duration: 0.25, ease: "easeOut" }} />}
              className={cn("flex h-9 items-center justify-center rounded-md border mono text-[11px] transition-colors duration-200", !v ? "border-border text-muted-foreground" : v.fail ? "border-fail/50 bg-fail/15 text-fail" : "border-pass/50 bg-pass/15 text-pass")}>{id}</TooltipTrigger>
            <TooltipContent className="block"><p className="font-medium">{s.attacks[id].name}</p><p className="opacity-80">{v ? `${v.fail}/${v.n} runs succeeded` : "not run yet"}</p></TooltipContent>
          </Tooltip>
        ); })}
      </div>
    </div>
  );
}

export function FixerLanes({ s, id }: { s: Summary; id: string }) {
  const lanes = s.clusters.filter((c) => !c.status.startsWith("merged_into"));
  if (!lanes.length) return <EmptyState icon={Wrench} title="No fixers yet" hint="A lane opens for each failure cluster once its divergence step is known." />;
  return (
    <Stagger className="grid gap-3">
      {lanes.map((c) => {
        const a = headlineAttempt(c.attempts);
        const running = c.status === "fixing" || a?.status === "running" || a?.status === "replaying";
        return (
          <StaggerItem key={c.cluster_id}>
            <Link href={`/a/${id}/fixes/${c.cluster_id}`} className={CARD_LINK}>
              <Card className={cn(PANEL, PANEL_LINK, "relative h-full overflow-hidden")}>
                {running && <BorderBeam size={100} duration={5} colorFrom="oklch(0.8 0.14 200)" colorTo="oklch(0.72 0.17 300)" />}
                <CardContent className="space-y-1.5 p-3">
                  <div className="flex items-start justify-between gap-2"><div className="flex min-w-0 flex-wrap gap-1">{c.attack_ids.map((x) => <Tone key={x} tone="fail">{x}</Tone>)}</div><StatusBadge status={clusterStatus(c)} /></div>
                  <p className="truncate text-xs font-medium">{c.attack_name}</p>
                  {a?.replay ? <ReplayDots replay={a.replay} compact /> : <Mono className="block truncate">{a ? `attempt ${a.n} · ${a.status}` : "waiting for fixer"}</Mono>}
                </CardContent>
              </Card>
            </Link>
          </StaggerItem>
        );
      })}
    </Stagger>
  );
}

export function useStageCounts(s: Summary | undefined, events: PreflightEvent[]) {
  return useMemo(() => {
    if (!s) return {};
    const attack = s.runs.filter((r) => r.kind === "attack");
    const replays = s.runs.filter((r) => r.kind === "replay");
    const after = s.runs.filter((r) => r.run_id.startsWith("after-"));
    const fixes = s.clusters.flatMap((c) => c.attempts).length;
    return {
      ATTACK: `${attack.length} runs`, GRADE: `${attack.filter((r) => r.failed).length} succeeded`, CLUSTER: `${s.clusters.length} clusters`,
      DIVERGE: `${s.clusters.filter((c) => c.divergence).length} divergences`, FIX: `${fixes} attempts · ${replays.length} replays`,
      AWAIT_APPROVAL: `${s.clusters.filter((c) => c.resolution === "merged").length} merged${s.clusters.some((c) => c.resolution === "closed_by_main") ? ` · ${s.clusters.filter((c) => c.resolution === "closed_by_main").length} closed by main` : ""}`, REGRESSION_SUITE: `${s.regressions.length} suites`,
      VERIFY_AFTER: s.after ? `${s.after.succeeded}/${s.after.total} after${s.after.undelivered ? ` · ${s.after.undelivered} not delivered` : ""}` : after.length ? `${after.length} runs` : undefined, DONE: s.after ? `${s.scorecard.succeeded} → ${s.after.succeeded}` : undefined,
    } as Record<string, string | undefined>;
  }, [s, events.length]);
}

/** Attacks that were not run because the target does not have what they need (sandbox targets only): `manifest.attacks_skipped`. */
export function SkippedAttacks({ skipped, attacks }: { skipped: SkippedAttack[]; attacks: Summary["attacks"] }) {
  if (!skipped.length) return null;
  return (
    <Disclosure title={<span>Skipped attacks <span className="mono tabular-nums">({skipped.length})</span>: not applicable to this target</span>}>
      <ul className="space-y-1.5">
        {skipped.map((s) => (
          <li key={s.attack_id} className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg border border-border/60 bg-card/60 px-3 py-2">
            <Tone className="shrink-0">{s.attack_id}</Tone>
            {attacks[s.attack_id]?.name && <span className="min-w-0 text-xs font-medium break-words text-foreground">{attacks[s.attack_id].name}</span>}
            <span className="min-w-0 basis-full text-xs leading-relaxed break-words text-muted-foreground sm:basis-auto">{s.reason}</span>
          </li>
        ))}
      </ul>
    </Disclosure>
  );
}
