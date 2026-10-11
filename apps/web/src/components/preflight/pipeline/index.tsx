"use client";
import { useMemo } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { Card, CardContent } from "@/components/ui/card";
import { BorderBeam } from "@/components/ui/border-beam";
import { cn } from "@/lib/utils";
import type { PreflightEvent, Summary } from "@/lib/api/types";
import { Mono, Tone } from "../shared";
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
  return (
    <div className="relative">
      <div className="absolute left-0 right-0 top-[22px] h-px bg-border" />
      <motion.div className="absolute left-0 top-[22px] h-px bg-gradient-to-r from-primary via-trace to-pass" initial={{ width: 0 }} animate={{ width: `${((done ? ORDER.length - 1 : cur) / (ORDER.length - 1)) * 100}%` }} transition={{ type: "spring", stiffness: 60, damping: 18 }} />
      <ol className="relative grid" style={{ gridTemplateColumns: `repeat(${STAGES.length}, minmax(0, 1fr))` }}>
        {STAGES.map((s, i) => {
          const status = done && i <= cur ? "done" : i < cur ? "done" : i === cur ? "active" : "todo";
          return (
            <li key={s.id} className="flex flex-col items-center text-center">
              <motion.div layout className={cn("size-11 rounded-full border flex items-center justify-center mono text-[11px] transition-colors bg-background z-10",
                status === "done" && "border-pass text-pass bg-pass/10", status === "active" && "border-primary text-primary pulse-ring", status === "todo" && "border-border text-muted-foreground")}>
                {status === "done" ? "✓" : i + 1}
              </motion.div>
              <p className={cn("mt-2 text-xs font-medium", status === "todo" ? "text-muted-foreground" : "text-foreground")}>{s.label}</p>
              <p className="text-[10px] text-muted-foreground hidden xl:block">{counts[s.id] ?? s.hint}</p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

type Row = { key: string; ts: number; kind: "run" | "cluster" | "fix" | "replay" | "state" | "recovery" | "merged" | "regression"; tone: "pass" | "fail" | "pending" | "trace" | "checkpoint" | "muted"; text: string; sub?: string; href?: string };

export function eventsToRows(events: PreflightEvent[], id: string, attacks: Summary["attacks"]): Row[] {
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
      case "merged": rows.push({ key: `m-${e.seq}`, ts: e.ts, kind: "merged", tone: "pass", text: `merged into main · ${e.cluster_id}`, sub: `regression test saved`, href: `${base}/regressions` }); break;
      case "regression.result": rows.push({ key: `reg-${e.seq}`, ts: e.ts, kind: "regression", tone: e.passed ? "pass" : "fail", text: `${e.passed ? "holding" : "REGRESSED"} · ${e.cluster_id}`, href: `${base}/regressions` }); break;
      case "recovery": rows.push({ key: `rec-${e.seq}`, ts: e.ts, kind: "recovery", tone: "pending", text: `recovered: ${e.kind}`, sub: e.detail }); break;
      case "state.changed": rows.push({ key: `s-${e.seq}`, ts: e.ts, kind: "state", tone: "muted", text: `→ ${e.state}` }); break;
      case "stopped": rows.push({ key: `st-${e.seq}`, ts: e.ts, kind: "state", tone: "fail", text: `stopped: ${e.reason}` }); break;
    }
  }
  return rows;
}

export function LiveFeed({ rows }: { rows: Row[] }) {
  const shown = [...rows].reverse().slice(0, 40);
  return (
    <ol className="space-y-1.5">
      <AnimatePresence initial={false}>
        {shown.map((r) => (
          <motion.li key={r.key} layout initial={{ opacity: 0, x: -12, filter: "blur(4px)" }} animate={{ opacity: 1, x: 0, filter: "blur(0px)" }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
            className={cn("rounded-lg border px-3 py-2 text-xs flex items-center gap-3 bg-card/70", r.tone === "fail" && "border-fail/40", r.tone === "pass" && "border-pass/30", r.tone === "pending" && "border-pending/40", r.tone === "trace" && "border-trace/40", r.tone === "checkpoint" && "border-checkpoint/40", r.tone === "muted" && "border-border/60")}>
            <span className={cn("size-2 rounded-full shrink-0", r.tone === "fail" ? "bg-fail" : r.tone === "pass" ? "bg-pass" : r.tone === "pending" ? "bg-pending" : r.tone === "trace" ? "bg-trace" : r.tone === "checkpoint" ? "bg-checkpoint" : "bg-muted-foreground/50")} />
            <Mono className="w-20 shrink-0 text-[10px] uppercase">{r.kind}</Mono>
            <div className="min-w-0 flex-1">
              {r.href ? <Link href={r.href} className="hover:underline">{r.text}</Link> : <span>{r.text}</span>}
              {r.sub && <p className="text-muted-foreground truncate">{r.sub}</p>}
            </div>
            <Mono className="shrink-0">{timeAgo(r.ts)}</Mono>
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
      <div className="flex items-center justify-between mb-2"><p className="text-sm font-medium">attack matrix</p><Mono>{byAttack.size}/{planned && planned !== "P0" ? planned.split(",").length : total} attacks run · {runs.filter((r) => r.failed).length} succeeded</Mono></div>
      <div className="grid grid-cols-10 xl:grid-cols-20 gap-1.5">
        {ids.map((id) => { const v = byAttack.get(id); return (
          <motion.div key={id} layout className={cn("h-9 rounded-md border flex items-center justify-center mono text-[11px]", !v ? "border-border text-muted-foreground" : v.fail ? "border-fail/50 bg-fail/15 text-fail" : "border-pass/50 bg-pass/15 text-pass")} animate={v ? { scale: [1, 1.08, 1] } : {}} transition={{ duration: 0.4 }}>{id}</motion.div>
        ); })}
      </div>
    </div>
  );
}

export function FixerLanes({ s, id }: { s: Summary; id: string }) {
  if (!s.clusters.length) return null;
  return (
    <div className="grid gap-3">
      {s.clusters.filter((c) => !c.status.startsWith("merged_into")).map((c) => {
        const a = c.attempts[c.attempts.length - 1];
        const running = c.status === "fixing" || a?.status === "running" || a?.status === "replaying";
        return (
          <Link key={c.cluster_id} href={`/a/${id}/fixes/${c.cluster_id}`}>
            <Card className="relative overflow-hidden border-border/60 h-full">
              {running && <BorderBeam size={100} duration={5} colorFrom="oklch(0.8 0.14 200)" colorTo="oklch(0.72 0.17 300)" />}
              <CardContent className="p-3 space-y-1.5">
                <div className="flex items-center justify-between"><div className="flex gap-1">{c.attack_ids.map((x) => <Tone key={x} tone="fail">{x}</Tone>)}</div><Tone tone={c.status === "merged" ? "pass" : c.status === "await_approval" ? "pending" : c.status === "needs_human" ? "fail" : "muted"}>{c.status.replace(/_/g, " ")}</Tone></div>
                <p className="text-xs font-medium truncate">{c.attack_name}</p>
                {a?.replay ? <ReplayDots replay={a.replay} compact /> : <Mono>{a ? `attempt ${a.n} · ${a.status}` : "waiting for fixer"}</Mono>}
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
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
      AWAIT_APPROVAL: `${s.clusters.filter((c) => c.status === "merged").length} merged`, REGRESSION_SUITE: `${s.regressions.length} suites`,
      VERIFY_AFTER: after.length ? `${after.filter((r) => r.failed).length}/${after.length} after` : undefined, DONE: s.after ? `${s.scorecard.succeeded} → ${s.after.succeeded}` : undefined,
    } as Record<string, string | undefined>;
  }, [s, events.length]);
}
