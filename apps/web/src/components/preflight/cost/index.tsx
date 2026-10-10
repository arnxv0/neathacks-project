"use client";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { NumberTicker } from "@/components/ui/number-ticker";
import type { Summary } from "@/lib/api/types";
import { money } from "@/lib/format";
import { Mono } from "../shared";

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
      <div className="grid gap-4 md:grid-cols-3">
        {tiles.map((t) => (
          <Card key={t.label} className="border-border/60"><CardContent className="p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{t.label}</p>
            <p className="text-4xl font-semibold tracking-tight mt-1">$<NumberTicker value={t.value} decimalPlaces={t.value < 1 ? 4 : 2} /></p>
            <p className="text-xs text-muted-foreground mt-1">{t.hint}</p>
          </CardContent></Card>
        ))}
      </div>
      <Card className="border-border/60"><CardContent className="p-5 space-y-3">
        <div className="flex items-center justify-between"><p className="text-sm font-medium">budget guard</p><Mono>{money(target + pf, 3)} of {money(cap)} cap</Mono></div>
        <Progress value={cap ? Math.min(100, ((target + pf) / cap) * 100) : 0} />
        <p className="text-xs text-muted-foreground">Caps are enforced in code: the assessment stops cleanly with a partial report when the cap is hit. The target's own model cost ({money(target, 4)}) is paid by the customer in production; Preflight's COGS is the rest.</p>
      </CardContent></Card>
      <Card className="border-border/60"><CardContent className="p-5">
        <p className="text-sm font-medium mb-2">cfo.ai inputs (measured, replaces the estimates in BUSINESS.md)</p>
        <table className="w-full text-sm"><tbody>
          <tr><td className="py-1 text-muted-foreground">cost_per_attack_run</td><td className="mono text-right">{money(perRun, 4)}</td></tr>
          <tr><td className="py-1 text-muted-foreground">cost_per_fix_attempt</td><td className="mono text-right">{money(fixes ? fix / fixes : 0, 2)}</td></tr>
          <tr><td className="py-1 text-muted-foreground">attempts_per_accepted_fix</td><td className="mono text-right">{(() => { const merged = s.clusters.filter((c) => c.status === "merged"); return merged.length ? (merged.reduce((n, c) => n + c.attempts.length, 0) / merged.length).toFixed(2) : "—"; })()}</td></tr>
          <tr><td className="py-1 text-muted-foreground">cost_per_full_assessment</td><td className="mono text-right">{money(total, 2)}</td></tr>
        </tbody></table>
        <p className="text-xs text-muted-foreground mt-2">Written to <span className="mono">out/cost_report.csv</span> after each assessment; pushed to a “Measured” scenario in cfo.ai through its MCP server.</p>
      </CardContent></Card>
    </div>
  );
}
