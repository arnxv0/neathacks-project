"use client";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Ticker } from "../shared/Ticker";
import type { Summary } from "@/lib/api/types";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Label, Mono, PANEL, Stagger, StaggerItem } from "../shared";

export function CostPanel({ s }: { s: Summary }) {
  const target = s.cost.target_usd, pf = s.cost.preflight_llm_usd, fix = s.cost.fixer_usd;
  const total = target + pf + fix;
  const attackRuns = s.runs.filter((r) => r.kind === "attack").length || 1;
  const perRun = (target + pf) / attackRuns;
  const fixes = s.clusters.flatMap((c) => c.attempts).length || 0;
  const cap = s.cost.cap_usd ?? 0;
  const tiles = [
    { label: "cost per attack run", value: perRun, hint: "target model + attacker/judge/analyst, from the ledger" },
    { label: "fixer spend", value: fix, hint: `${fixes} Claude Code attempt${fixes === 1 ? "" : "s"}` },
    { label: "this assessment", value: total, hint: `${s.runs.length} runs incl. replays` },
  ];
  return (
    <div className="space-y-6">
      <Stagger className="grid gap-4 sm:grid-cols-3">
        {tiles.map((t) => (
          <StaggerItem key={t.label}><Card className={cn(PANEL, "h-full")}><CardContent className="p-5">
            <Label>{t.label}</Label>
            <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums xl:text-4xl">$<Ticker value={t.value} decimals={t.value < 1 ? 4 : 2} /></p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t.hint}</p>
          </CardContent></Card></StaggerItem>
        ))}
      </Stagger>
      <Card className={PANEL}><CardContent className="p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1"><h2 className="text-sm font-medium">Budget guard</h2><Mono>{money(target + pf, 3)} of {money(cap)} cap</Mono></div>
        <Progress aria-label="Share of the budget cap spent" className="**:data-[slot=progress-track]:h-1.5 **:data-[slot=progress-indicator]:duration-500 **:data-[slot=progress-indicator]:ease-out" value={cap ? Math.min(100, ((target + pf) / cap) * 100) : 0} />
        <p className="max-w-4xl text-xs leading-relaxed text-muted-foreground">Caps are enforced in code: the assessment stops cleanly with a partial report when the cap is hit. The target's own model cost ({money(target, 4)}) is paid by the customer in production; Preflight's COGS is the rest.</p>
      </CardContent></Card>
      <Card className={PANEL}><CardContent className="p-5">
        <h2 className="mb-2 text-sm font-medium">cfo.ai inputs (measured, replaces the estimates in BUSINESS.md)</h2>
        <table className="w-full text-sm [&_td:first-child]:font-mono [&_td:first-child]:text-xs [&_td:first-child]:break-all [&_td:first-child]:pr-4 [&_tr]:border-b [&_tr]:border-border/50 [&_tr:last-child]:border-0"><tbody>
          <tr><td className="py-2 text-muted-foreground">cost_per_attack_run</td><td className="mono text-right whitespace-nowrap">{money(perRun, 4)}</td></tr>
          <tr><td className="py-2 text-muted-foreground">cost_per_fix_attempt</td><td className="mono text-right whitespace-nowrap">{money(fixes ? fix / fixes : 0, 2)}</td></tr>
          <tr><td className="py-2 text-muted-foreground">attempts_per_accepted_fix</td><td className="mono text-right whitespace-nowrap">{(() => { const merged = s.clusters.filter((c) => c.status === "merged"); return merged.length ? (merged.reduce((n, c) => n + c.attempts.length, 0) / merged.length).toFixed(2) : "—"; })()}</td></tr>
          <tr><td className="py-2 text-muted-foreground">cost_per_full_assessment</td><td className="mono text-right whitespace-nowrap">{money(total, 2)}</td></tr>
        </tbody></table>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Written to <span className="mono">out/cost_report.csv</span> after each assessment; pushed to a “Measured” scenario in cfo.ai through its MCP server.</p>
      </CardContent></Card>
    </div>
  );
}
