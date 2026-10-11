"use client";
import { use, useMemo } from "react";
import Link from "next/link";
import { useCluster } from "@/lib/api/hooks";
import { useEventStream } from "@/lib/sse/useEventStream";
import { AttemptHistory, CheckpointPanel, DiffViewer, ReplayDots, ReviewActions, headlineAttempt } from "@/components/preflight/fixes";
import { Markdown, Mono, SectionHeader, StatusBadge, Tone } from "@/components/preflight/shared";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { BorderBeam } from "@/components/ui/border-beam";
import { Card, CardContent } from "@/components/ui/card";

export default function FixPage({ params }: { params: Promise<{ id: string; cid: string }> }) {
  const { id, cid } = use(params);
  const { data: c } = useCluster(id, cid);
  const { events } = useEventStream(id);
  const live = useMemo(() => {
    const ev = [...events].reverse().find((e) => e.type === "replay.progress" && e.cluster_id === cid);
    return ev ? { passed: ev.passed as number, total: ev.total as number } : undefined;
  }, [events, cid]);
  if (!c) return <Skeleton className="h-96" />;
  // Headline the approved / passed attempt (a stale `replaying` row from a stopped process must not hide a 10/10 result); the Attempts tab lists all of them.
  const a = headlineAttempt(c.attempts);
  const running = c.status === "fixing" || a?.status === "running" || a?.status === "replaying";
  return (
    <div className="space-y-6">
      <SectionHeader title={c.attack?.name ?? cid} subtitle={c.hypothesis}
        right={<div className="flex items-center gap-2"><StatusBadge status={c.status} /><Button variant="outline" size="sm" render={<Link href={`/a/${id}/clusters/${cid}`} />}>← divergence</Button></div>} />
      <Card className="relative overflow-hidden border-border/60">
        {running && <BorderBeam size={200} duration={5} colorFrom="oklch(0.8 0.14 200)" colorTo="oklch(0.72 0.17 300)" />}
        <CardContent className="p-5 flex flex-wrap items-center gap-6">
          <div><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-1">replay proof{a && c.attempts.length > 1 ? ` · attempt ${a.n} of ${c.attempts.length}` : ""}</p>{a ? <ReplayDots replay={a.replay} live={running ? live : undefined} /> : <Mono>waiting for the fixer…</Mono>}</div>
          <div className="ml-auto"><ReviewActions id={id} c={c} /></div>
        </CardContent>
      </Card>
      {a && <CheckpointPanel a={a} />}
      <Tabs defaultValue="diff">
        <TabsList><TabsTrigger value="diff">Diff</TabsTrigger><TabsTrigger value="brief">Fixer brief</TabsTrigger><TabsTrigger value="history">Attempts ({c.attempts.length})</TabsTrigger><TabsTrigger value="replays">Replay runs</TabsTrigger></TabsList>
        <TabsContent value="diff" className="pt-4"><DiffViewer diff={a?.diff ?? ""} /></TabsContent>
        <TabsContent value="brief" className="pt-4"><Markdown text={a?.brief ?? ""} /></TabsContent>
        <TabsContent value="history" className="pt-4"><AttemptHistory attempts={c.attempts} /></TabsContent>
        <TabsContent value="replays" className="pt-4"><ul className="space-y-1">{(a?.replay_runs ?? []).map((r) => <li key={r.run_id} className="flex items-center gap-2"><Tone tone={r.failed ? "fail" : "pass"}>{r.failed ? "fail" : "pass"}</Tone><Link className="mono text-xs text-primary hover:underline" href={`/a/${id}/runs/${r.run_id}`}>{r.run_id}</Link>{r.neatlogs_url && <a className="mono text-xs text-trace" href={r.neatlogs_url} target="_blank" rel="noreferrer">trace</a>}</li>)}</ul></TabsContent>
      </Tabs>
    </div>
  );
}
