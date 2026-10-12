"use client";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { Spotlight } from "@/components/ui/spotlight";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { FAMILIES } from "@/lib/format";
import type { AttackInfo, Run, Scorecard } from "@/lib/api/types";
import { EASE, Label, PANEL, Stagger, StaggerItem, Tone } from "../shared";
import { Ticker } from "../shared/Ticker";

/** `lost`: runs in which the attack never reached the agent. They are taken out of the denominator and named, never counted as blocked. */
function BigStat({ label, value, total, tone, note, live, lost = 0 }: { label: string; value: number; total: number; tone: string; note: string; live?: boolean; lost?: number }) {
  return (
    <div className="min-w-0">
      <Label className="tracking-[0.2em]">{label}</Label>
      <div className="mt-1 flex items-baseline gap-2 sm:gap-3">
        <Ticker value={value} className={cn("text-5xl font-semibold tracking-tighter transition-colors duration-200 sm:text-6xl", tone)} />
        <span className="text-2xl text-muted-foreground tabular-nums sm:text-3xl">/ {total - lost}</span>
        {live && <span className="ml-1 inline-flex items-center gap-1.5 text-xs text-primary"><span aria-hidden className="size-1.5 animate-pulse rounded-full bg-primary" />live</span>}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{note}</p>
      {lost > 0 && <p className="mt-1 max-w-xs text-xs leading-relaxed text-pending">{lost} of {total} runs not counted: the attack never reached the agent (no request arrived at the chaos proxy).</p>}
    </div>
  );
}

export function ScorecardHero({ sc, after, running }: { sc: Scorecard; after: Scorecard | null; running: boolean }) {
  const owasp = Object.entries(sc.by_owasp).sort();
  return (
    <Card className={cn(PANEL, "relative overflow-hidden")}>
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden"><Spotlight className="-top-40 left-0 md:left-60" fill="oklch(0.8 0.14 200)" /></div>
      <CardContent className="relative z-10 grid gap-x-10 gap-y-6 p-5 sm:p-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="flex min-w-0 flex-wrap items-end gap-x-8 gap-y-6 sm:gap-x-10">
          <BigStat label="attacks that succeeded" value={sc.succeeded} total={sc.total} tone={sc.succeeded ? "text-fail" : "text-pass"} note="before fixes" live={running} lost={sc.undelivered ?? 0} />
          {after && (
            <>
              <motion.div aria-hidden initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25, ease: EASE, delay: 0.15 }} className="hidden self-center text-muted-foreground/60 sm:block"><ArrowRight className="size-8" strokeWidth={1.5} /></motion.div>
              <BigStat label="after fixes" value={after.succeeded} total={after.total} tone={after.succeeded || after.undelivered ? "text-pending" : "text-pass"} note="same seeds, merged main" lost={after.undelivered ?? 0} />
            </>
          )}
        </div>
        {owasp.length > 0 && (
          <div className="min-w-0 border-t border-border/60 pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
            <Label className="mb-2">by OWASP LLM category</Label>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-1 sm:grid-cols-3 lg:grid-cols-2">
              {owasp.map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-4">
                  <dt className="mono text-xs text-muted-foreground">{k}</dt>
                  <dd className={cn("mono text-xs", v.succeeded ? "text-fail" : "text-pass")}>{v.succeeded}/{v.runs}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function FamilyGrid({ sc, attacks, runs, id, after }: { sc: Scorecard; attacks: Record<string, AttackInfo>; runs: Run[]; id: string; after: Scorecard | null }) {
  const families = Object.keys(FAMILIES).filter((f) => Object.values(attacks).some((a) => a.family === f && a.tier === "P0"));
  return (
    <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {families.map((f) => {
        const list = Object.values(attacks).filter((a) => a.family === f && a.tier === "P0").sort((a, b) => a.id.localeCompare(b.id));
        const fam = sc.by_family[f];
        return (
          <StaggerItem key={f}>
            <Card className={cn(PANEL, "h-full")}>
              <CardContent className="p-4">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="min-w-0"><p className="truncate text-sm font-medium">{FAMILIES[f]}</p><p className="mono text-[11px] text-muted-foreground">family {f}</p></div>
                  {fam ? <Tone tone={fam.succeeded ? "fail" : "pass"}>{fam.succeeded}/{fam.runs}</Tone> : <Tone>idle</Tone>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {list.map((a) => <AttackCell key={a.id} attack={a} score={sc.by_attack[a.id]} afterScore={after?.by_attack[a.id]} runs={runs.filter((r) => r.attack_id === a.id && r.kind === "attack")} id={id} />)}
                </div>
              </CardContent>
            </Card>
          </StaggerItem>
        );
      })}
    </Stagger>
  );
}

function AttackCell({ attack, score, afterScore, runs, id }: { attack: AttackInfo; score?: Scorecard["by_attack"][string]; afterScore?: Scorecard["by_attack"][string]; runs: Run[]; id: string }) {
  const running = runs.length === 0 && !score;
  const tone = !score ? "idle" : score.succeeded ? "fail" : "pass";
  return (
    <Tooltip>
      <TooltipTrigger render={<Link href={`/a/${id}/clusters?attack=${attack.id}`} />} className={cn("mono inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs whitespace-nowrap transition-[transform,background-color,border-color,color] duration-150 ease-out hover:-translate-y-0.5",
          tone === "fail" && "border-fail/40 bg-fail/10 text-fail hover:bg-fail/20", tone === "pass" && "border-pass/40 bg-pass/10 text-pass hover:bg-pass/20", tone === "idle" && "border-border text-muted-foreground hover:bg-muted")}>
          <span>{attack.id}{score ? ` ${score.succeeded}/${score.runs}` : running ? " …" : ""}</span>{afterScore && <span className="inline-flex items-center gap-1 text-muted-foreground"><ArrowRight aria-hidden className="size-3" />{afterScore.undelivered ? <span className="text-pending" title={`The attack was not delivered in ${afterScore.undelivered} of ${afterScore.runs} after-runs, so this is not a result.`}>{afterScore.undelivered === afterScore.runs ? "not delivered" : `${afterScore.succeeded} (${afterScore.undelivered} not delivered)`}</span> : afterScore.succeeded}</span>}
      </TooltipTrigger>
      <TooltipContent className="block max-w-xs"><p className="font-medium">{attack.name}</p><p className="text-xs opacity-80">{attack.owasp ?? "reliability"} · {attack.description.slice(0, 160)}</p></TooltipContent>
    </Tooltip>
  );
}
