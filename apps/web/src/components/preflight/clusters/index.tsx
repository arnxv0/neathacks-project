"use client";
import Link from "next/link";
import { ArrowRight, ExternalLink, GitBranch } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button as MovingButton } from "@/components/ui/moving-border";
import { TracingBeam } from "@/components/ui/tracing-beam";
import { cn } from "@/lib/utils";
import type { Cluster, ClusterDetail, Step } from "@/lib/api/types";
import { CARD_LINK, Disclosure, Label, Markdown, Mono, PANEL, PANEL_LINK, Stagger, StaggerItem, StatusBadge, Tone, Truncate } from "../shared";

export function ClusterCard({ c, id }: { c: Cluster; id: string }) {
  const last = c.attempts[c.attempts.length - 1];
  return (
    <Link href={`/a/${id}/clusters/${c.cluster_id}`} className={CARD_LINK}>
      <Card className={cn(PANEL, PANEL_LINK, "h-full")}>
        <CardContent className="flex h-full flex-col gap-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">{c.attack_ids.map((a) => <Tone key={a} tone="fail">{a}</Tone>)}{c.owasp && <Mono>{c.owasp}</Mono>}</div>
            <StatusBadge status={c.status} />
          </div>
          <p className="text-sm leading-snug font-medium break-words">{c.attack_name}</p>
          <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">{c.hypothesis || "analyzing…"}</p>
          <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-2">
            <Mono className="whitespace-nowrap">{c.run_ids.length} run{c.run_ids.length === 1 ? "" : "s"}</Mono>
            <Mono className="max-w-full truncate">graders: {c.failing_graders.join(", ")}</Mono>
            {c.divergence && <Mono className="whitespace-nowrap text-trace">step {c.divergence.step_index}</Mono>}
            {last?.replay && <Mono className={cn("inline-flex items-center gap-1 whitespace-nowrap", last.replay.passed === last.replay.total ? "text-pass" : "text-pending")}>{last.replay.before}<ArrowRight aria-hidden className="size-3" />{last.replay.after}</Mono>}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

/** Responsive, staggered grid of cluster cards; cards slide to their new place when the list reorders. */
export function ClusterGrid({ clusters, id }: { clusters: Cluster[]; id: string }) {
  return (
    <Stagger className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {clusters.map((c) => <StaggerItem key={c.cluster_id}><ClusterCard c={c} id={id} /></StaggerItem>)}
    </Stagger>
  );
}

export function TraceLink({ href, label = "Open in neatlogs" }: { href: string; label?: string }) {
  return (
    <MovingButton as="a" href={href} target="_blank" rel="noreferrer" borderRadius="0.75rem" containerClassName="h-9 w-auto shrink-0" className="bg-background text-trace border-trace/30 text-xs px-3.5 font-medium whitespace-nowrap" duration={3000}>
      <ExternalLink aria-hidden className="size-3.5 mr-2" />{label}
    </MovingButton>
  );
}

const STEP_LABEL: Record<string, string> = { user_message: "USER", llm_call: "MODEL", tool_call: "TOOL", reply: "REPLY", upstream_attempt: "UPSTREAM", sql_result: "SQL" };

export function StepTimeline({ steps, highlight, title, tone }: { steps: Step[]; highlight: number | null; title: string; tone: "pass" | "fail" }) {
  const shown = steps.filter((s) => ["user_message", "llm_call", "tool_call", "reply", "upstream_attempt"].includes(s.type));
  return (
    <div className="min-w-0">
      <div className="mb-3 flex min-w-0 items-center gap-2"><Tone tone={tone} className="max-w-full shrink"><span className="truncate">{title}</span></Tone></div>
      <Stagger as="ol" className="space-y-1.5">
        {shown.map((s) => {
          const hit = s.i === highlight;
          const text = s.type === "tool_call" ? `${s.tool}(${JSON.stringify(s.args ?? {}).slice(0, 110)}) → ${s.result_kind}` :
            s.type === "llm_call" ? (s.result_kind === "tool_calls" ? `→ calls ${s.tool}` : "→ final answer") :
            s.type === "upstream_attempt" ? `attempt ${String(s.raw.attempt)} → ${String(s.raw.status)}` : (s.result_excerpt ?? "");
          return (
            <StaggerItem as="li" key={s.i} className={cn("flex items-start gap-2 rounded-lg border px-3 py-2 text-xs transition-colors duration-200 sm:gap-3", hit ? (tone === "fail" ? "border-fail bg-fail/10 shadow-[0_0_30px_-10px_var(--fail)]" : "border-pass bg-pass/10") : "border-border/60 bg-card/60")}>
              <Mono className="w-5 shrink-0 text-right">{s.i}</Mono>
              <span className={cn("mono w-16 shrink-0 text-[10px] leading-4 uppercase", s.type === "tool_call" ? "text-primary" : s.type === "reply" ? "text-pass" : "text-muted-foreground")}>{STEP_LABEL[s.type] ?? s.type}</span>
              <span className={cn("min-w-0 [overflow-wrap:anywhere]", hit && "font-medium")}>{text}{hit && <span className="ml-2 text-[10px] tracking-wider whitespace-nowrap uppercase">◀ divergence</span>}</span>
            </StaggerItem>
          );
        })}
      </Stagger>
    </div>
  );
}

export function DivergenceView({ c }: { c: ClusterDetail }) {
  const d = c.divergence;
  if (!d) return <p className="text-sm text-muted-foreground">Divergence not computed yet.</p>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Tone tone="trace">first divergence at step {d.step_index}</Tone>
        <Mono>{d.mode === "pass_vs_fail" ? "passing run vs failing run" : "failing run vs safe-behavior spec"}</Mono>
        <div className="flex flex-wrap gap-2 sm:ml-auto">{d.trace_links.map((l, i) => <TraceLink key={l} href={l} label={i === 0 ? "Failing trace in neatlogs" : "Passing trace in neatlogs"} />)}</div>
      </div>
      <Card className={PANEL}><CardContent className="p-4 text-sm leading-relaxed break-words"><span className="text-muted-foreground">at the divergent step: </span>{d.step_desc}</CardContent></Card>
      {/* The beam is drawn to the left of the content; it needs the gutter, so it is only shown from md up. */}
      <div className="md:pl-8">
        <TracingBeam className="max-w-none [&>div:first-child]:hidden md:[&>div:first-child]:block md:[&>div:first-child]:-left-10">
          <div className={cn("grid gap-6", c.pass_steps.length ? "xl:grid-cols-2" : "")}>
            <StepTimeline steps={c.fail_steps} highlight={d.step_index} title={`failing · ${d.run_fail}`} tone="fail" />
            {c.pass_steps.length > 0 && <StepTimeline steps={c.pass_steps} highlight={null} title={`passing · ${d.run_pass}`} tone="pass" />}
          </div>
        </TracingBeam>
      </div>
    </div>
  );
}

export function HypothesisCard({ c }: { c: ClusterDetail }) {
  return (
    <Card className={PANEL}>
      <CardContent className="space-y-3 p-5">
        <Label>root-cause hypothesis</Label>
        <p className="max-w-4xl text-sm leading-relaxed break-words">{c.hypothesis || "…"}</p>
        {c.suspected_paths.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {c.suspected_paths.map((p) => (
              <span key={p} className="inline-flex max-w-full items-center gap-1 rounded bg-muted px-2 py-0.5 text-checkpoint"><GitBranch aria-hidden className="size-3 shrink-0" /><Truncate text={p} className="mono text-xs" /></span>
            ))}
          </div>
        )}
        {c.attack && <Disclosure title="safe behavior the fix must reach"><p className="max-w-4xl leading-relaxed text-muted-foreground">{c.attack.safe_behavior}</p></Disclosure>}
        {c.graph_md && <Disclosure defaultOpen tone="checkpoint" title="entire-graph: blast radius of the suspected code"><Markdown text={c.graph_md} /></Disclosure>}
      </CardContent>
    </Card>
  );
}

export function DivergenceMarkdown({ text }: { text: string }) {
  return <Markdown text={text} />;
}
