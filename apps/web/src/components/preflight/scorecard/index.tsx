"use client";
import Link from "next/link";
import { motion } from "motion/react";
import { Spotlight } from "@/components/ui/spotlight";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { FAMILIES } from "@/lib/format";
import type { AttackInfo, Run, Scorecard } from "@/lib/api/types";
import { Tone } from "../shared";
import { Ticker } from "../shared/Ticker";

export function ScorecardHero({ sc, after, running }: { sc: Scorecard; after: Scorecard | null; running: boolean }) {
  return (
    <Card className="relative overflow-hidden border-border/60">
      <Spotlight className="-top-40 left-0 md:left-60" fill="oklch(0.8 0.14 200)" />
      <CardContent className="relative z-10 py-8 px-8 flex flex-wrap items-end gap-10">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">attacks that succeeded</p>
          <div className="flex items-baseline gap-3 mt-1">
            <Ticker value={sc.succeeded} className={cn("text-6xl font-semibold tracking-tighter", sc.succeeded ? "text-fail" : "text-pass")} />
            <span className="text-3xl text-muted-foreground">/ {sc.total}</span>
            {running && <span className="ml-2 text-xs text-primary animate-pulse">live</span>}
          </div>
          <p className="text-sm text-muted-foreground mt-1">before fixes</p>
        </div>
        {after && (
          <>
            <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="text-4xl text-muted-foreground/60 self-center">→</motion.div>
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">after fixes</p>
              <div className="flex items-baseline gap-3 mt-1">
                <Ticker value={after.succeeded} className={cn("text-6xl font-semibold tracking-tighter", after.succeeded ? "text-pending" : "text-pass")} />
                <span className="text-3xl text-muted-foreground">/ {after.total}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">same seeds, merged main</p>
            </div>
          </>
        )}
        <div className="ml-auto grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
          {Object.entries(sc.by_owasp).sort().map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-4"><span className="mono text-xs text-muted-foreground">{k}</span><span className={cn("mono text-xs", v.succeeded ? "text-fail" : "text-pass")}>{v.succeeded}/{v.runs}</span></div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function FamilyGrid({ sc, attacks, runs, id, after }: { sc: Scorecard; attacks: Record<string, AttackInfo>; runs: Run[]; id: string; after: Scorecard | null }) {
  const families = Object.keys(FAMILIES).filter((f) => Object.values(attacks).some((a) => a.family === f && a.tier === "P0"));
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {families.map((f) => {
        const list = Object.values(attacks).filter((a) => a.family === f && a.tier === "P0").sort((a, b) => a.id.localeCompare(b.id));
        const fam = sc.by_family[f];
        return (
          <Card key={f} className="border-border/60">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div><p className="text-sm font-medium">{FAMILIES[f]}</p><p className="mono text-[11px] text-muted-foreground">family {f}</p></div>
                {fam ? <Tone tone={fam.succeeded ? "fail" : "pass"}>{fam.succeeded}/{fam.runs}</Tone> : <Tone>idle</Tone>}
              </div>
              <div className="flex flex-wrap gap-2">
                {list.map((a) => <AttackCell key={a.id} attack={a} score={sc.by_attack[a.id]} afterScore={after?.by_attack[a.id]} runs={runs.filter((r) => r.attack_id === a.id && r.kind === "attack")} id={id} />)}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function AttackCell({ attack, score, afterScore, runs, id }: { attack: AttackInfo; score?: Scorecard["by_attack"][string]; afterScore?: Scorecard["by_attack"][string]; runs: Run[]; id: string }) {
  const running = runs.length === 0 && !score;
  const tone = !score ? "idle" : score.succeeded ? "fail" : "pass";
  return (
    <Tooltip>
      <TooltipTrigger render={<Link href={`/a/${id}/clusters?attack=${attack.id}`} />} className={cn("rounded-lg border px-2.5 py-1.5 mono text-xs transition-all",
          tone === "fail" && "border-fail/40 bg-fail/10 text-fail", tone === "pass" && "border-pass/40 bg-pass/10 text-pass", tone === "idle" && "border-border text-muted-foreground")}>
          {attack.id}{score ? ` ${score.succeeded}/${score.runs}` : running ? " …" : ""}{afterScore && <span className="text-muted-foreground"> → {afterScore.succeeded}</span>}
      </TooltipTrigger>
      <TooltipContent className="max-w-xs"><p className="font-medium">{attack.name}</p><p className="text-xs text-muted-foreground">{attack.owasp ?? "reliability"} · {attack.description.slice(0, 160)}</p></TooltipContent>
    </Tooltip>
  );
}
