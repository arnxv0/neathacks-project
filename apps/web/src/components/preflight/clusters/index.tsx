"use client";
import Link from "next/link";
import { ExternalLink, GitBranch } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button as MovingButton } from "@/components/ui/moving-border";
import { TracingBeam } from "@/components/ui/tracing-beam";
import { cn } from "@/lib/utils";
import type { Cluster, ClusterDetail, Step } from "@/lib/api/types";
import { Markdown, Mono, StatusBadge, Tone } from "../shared";

export function ClusterCard({ c, id }: { c: Cluster; id: string }) {
  const last = c.attempts[c.attempts.length - 1];
  return (
    <Link href={`/a/${id}/clusters/${c.cluster_id}`}>
      <Card className="border-border/60 hover:border-primary/40 transition-colors h-full">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">{c.attack_ids.map((a) => <Tone key={a} tone="fail">{a}</Tone>)}{c.owasp && <Mono>{c.owasp}</Mono>}</div>
            <StatusBadge status={c.status} />
          </div>
          <p className="text-sm font-medium leading-snug">{c.attack_name}</p>
          <p className="text-xs text-muted-foreground line-clamp-3">{c.hypothesis || "analyzing…"}</p>
          <div className="flex items-center gap-3 pt-1">
            <Mono>{c.run_ids.length} run{c.run_ids.length === 1 ? "" : "s"}</Mono>
            <Mono>graders: {c.failing_graders.join(", ")}</Mono>
            {c.divergence && <Mono className="text-trace">step {c.divergence.step_index}</Mono>}
            {last?.replay && <Mono className={last.replay.passed === last.replay.total ? "text-pass" : "text-pending"}>{last.replay.before} → {last.replay.after}</Mono>}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export function TraceLink({ href, label = "Open in neatlogs" }: { href: string; label?: string }) {
  return (
    <MovingButton as="a" href={href} target="_blank" rel="noreferrer" borderRadius="0.75rem" containerClassName="h-10 w-auto" className="bg-background text-trace border-trace/30 text-xs px-4 font-medium" duration={3000}>
      <ExternalLink className="size-3.5 mr-2" />{label}
    </MovingButton>
  );
}

const STEP_LABEL: Record<string, string> = { user_message: "USER", llm_call: "MODEL", tool_call: "TOOL", reply: "REPLY", upstream_attempt: "UPSTREAM", sql_result: "SQL" };

export function StepTimeline({ steps, highlight, title, tone }: { steps: Step[]; highlight: number | null; title: string; tone: "pass" | "fail" }) {
  const shown = steps.filter((s) => ["user_message", "llm_call", "tool_call", "reply", "upstream_attempt"].includes(s.type));
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 mb-3"><Tone tone={tone}>{title}</Tone></div>
      <ol className="space-y-1.5">
        {shown.map((s) => {
          const hit = s.i === highlight;
          const text = s.type === "tool_call" ? `${s.tool}(${JSON.stringify(s.args ?? {}).slice(0, 110)}) → ${s.result_kind}` :
            s.type === "llm_call" ? (s.result_kind === "tool_calls" ? `→ calls ${s.tool}` : "→ final answer") :
            s.type === "upstream_attempt" ? `attempt ${String(s.raw.attempt)} → ${String(s.raw.status)}` : (s.result_excerpt ?? "");
          return (
            <li key={s.i} className={cn("rounded-lg border px-3 py-2 text-xs flex gap-3 items-start transition-colors", hit ? (tone === "fail" ? "border-fail bg-fail/10 shadow-[0_0_30px_-10px_var(--fail)]" : "border-pass bg-pass/10") : "border-border/60 bg-card/60")}>
              <Mono className="w-6 shrink-0 text-right">{s.i}</Mono>
              <span className={cn("mono shrink-0 w-16 text-[10px] uppercase", s.type === "tool_call" ? "text-primary" : s.type === "reply" ? "text-pass" : "text-muted-foreground")}>{STEP_LABEL[s.type] ?? s.type}</span>
              <span className={cn("break-words min-w-0", hit && "font-medium")}>{text}{hit && <span className="ml-2 text-[10px] uppercase tracking-wider">◀ divergence</span>}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function DivergenceView({ c }: { c: ClusterDetail }) {
  const d = c.divergence;
  if (!d) return <p className="text-sm text-muted-foreground">Divergence not computed yet.</p>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Tone tone="trace">first divergence at step {d.step_index}</Tone>
        <Mono>{d.mode === "pass_vs_fail" ? "passing run vs failing run" : "failing run vs safe-behavior spec"}</Mono>
        <div className="ml-auto flex gap-2">{d.trace_links.map((l, i) => <TraceLink key={l} href={l} label={i === 0 ? "Failing trace in neatlogs" : "Passing trace in neatlogs"} />)}</div>
      </div>
      <Card className="border-border/60"><CardContent className="p-4 text-sm"><span className="text-muted-foreground">at the divergent step: </span>{d.step_desc}</CardContent></Card>
      <TracingBeam className="px-2">
        <div className={cn("grid gap-6", c.pass_steps.length ? "md:grid-cols-2" : "")}>
          <StepTimeline steps={c.fail_steps} highlight={d.step_index} title={`failing · ${d.run_fail}`} tone="fail" />
          {c.pass_steps.length > 0 && <StepTimeline steps={c.pass_steps} highlight={null} title={`passing · ${d.run_pass}`} tone="pass" />}
        </div>
      </TracingBeam>
    </div>
  );
}

export function HypothesisCard({ c }: { c: ClusterDetail }) {
  return (
    <Card className="border-border/60">
      <CardContent className="p-5 space-y-3">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">root-cause hypothesis</p>
        <p className="text-sm leading-relaxed">{c.hypothesis || "…"}</p>
        {c.suspected_paths.length > 0 && <div className="flex flex-wrap gap-2">{c.suspected_paths.map((p) => <Mono key={p} className="rounded bg-muted px-2 py-0.5 text-checkpoint"><GitBranch className="inline size-3 mr-1" />{p}</Mono>)}</div>}
        {c.attack && <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">safe behavior the fix must reach</summary><p className="mt-2">{c.attack.safe_behavior}</p></details>}
      </CardContent>
    </Card>
  );
}

export function DivergenceMarkdown({ text }: { text: string }) {
  return <Markdown text={text} />;
}
