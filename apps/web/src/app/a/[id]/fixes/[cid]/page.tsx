"use client";
import { use, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, FileDiff, GitMerge, ListChecks } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useCluster } from "@/lib/api/hooks";
import { useEventStream } from "@/lib/sse/useEventStream";
import { AttemptHistory, CheckpointPanel, DiffViewer, ReplayDots, ReviewActions, headlineAttempt } from "@/components/preflight/fixes";
import { DataView, EmptyState, FadeRise, Label, Markdown, Mono, PageHeader, PANEL, StatusBadge, clusterStatus, Tone, Truncate } from "@/components/preflight/shared";
import { FixDetailSkeleton } from "@/components/preflight/shared/skeletons";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { BorderBeam } from "@/components/ui/border-beam";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function FixPage({ params }: { params: Promise<{ id: string; cid: string }> }) {
  const { id, cid } = use(params);
  const query = useCluster(id, cid);
  const { events } = useEventStream(id);
  const live = useMemo(() => {
    const ev = [...events].reverse().find((e) => e.type === "replay.progress" && e.cluster_id === cid);
    return ev ? { passed: ev.passed as number, total: ev.total as number } : undefined;
  }, [events, cid]);
  return (
    <DataView query={query} what="the fix" skeleton={<FixDetailSkeleton />}>
      {(c) => {
        // Headline the approved / passed attempt (a stale `replaying` row from a stopped process must not hide a 10/10 result); the Attempts tab lists all of them.
        const a = headlineAttempt(c.attempts);
        const running = c.status === "fixing" || a?.status === "running" || a?.status === "replaying";
        return (
          <div>
            <PageHeader title={c.attack?.name ?? cid} subtitle={c.hypothesis}
              crumbs={[{ label: "Scorecard", href: `/a/${id}` }, { label: "Fixes", href: `/a/${id}/fixes` }, { label: cid }]}
              right={<Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/a/${id}/clusters/${cid}`} />}><ArrowLeft />Divergence</Button>}
              meta={<><StatusBadge status={clusterStatus(c)} />{c.attack_ids.map((x) => <Tone key={x} tone="fail">{x}</Tone>)}<Truncate text={cid} className="mono text-xs text-muted-foreground" /></>} />
            <div className="space-y-6">
              {c.resolution === "closed_by_main" && a && (
                <Alert>
                  <GitMerge />
                  <AlertTitle>Approved, but this diff was not merged</AlertTitle>
                  <AlertDescription>
                    The branch conflicted with a fix that was approved earlier, so Preflight left it out and replayed the same failing seeds on main instead
                    {a.merge_commit ? <> (commit <span className="mono">{a.merge_commit.slice(0, 7)}</span>)</> : null}. Main passed {a.replay?.after ?? "the replay"}, so this root cause was already closed by the earlier fixes. The replay proof below is that run on main, not a run of this diff.
                  </AlertDescription>
                </Alert>
              )}
              <Card className={cn(PANEL, "relative overflow-hidden")}>
                {running && <BorderBeam size={200} duration={5} colorFrom="oklch(0.8 0.14 200)" colorTo="oklch(0.72 0.17 300)" />}
                {/* Proof on the left, actions on the right; below 2xl the actions get their own row under a divider so they can never run into the dots. */}
                <CardContent className="flex flex-col gap-4 p-4 sm:p-5 2xl:flex-row 2xl:items-center 2xl:justify-between 2xl:gap-8">
                  <div className="min-w-0"><Label className="mb-2">replay proof{c.resolution === "closed_by_main" ? " · measured on main" : ""}{a && c.attempts.length > 1 ? ` · attempt ${a.n} of ${c.attempts.length}` : ""}</Label>{a ? <ReplayDots replay={a.replay} live={running ? live : undefined} /> : <Mono>waiting for the fixer…</Mono>}</div>
                  <div className="shrink-0 border-t border-border/60 pt-4 2xl:border-t-0 2xl:pt-0"><ReviewActions id={id} c={c} /></div>
                </CardContent>
              </Card>
              {/* CheckpointPanel is owned by the fixes feature; its header row is made wrap-safe from here. */}
              {a && <div className="[&_[data-slot=card]]:gap-0 [&_[data-slot=card]]:py-0 [&_[data-slot=card-content]>div:first-child]:flex-wrap [&_[data-slot=card-content]>div:first-child]:gap-y-1 [&_[data-slot=card-content]_.mono]:break-all"><CheckpointPanel a={a} /></div>}
              <Tabs defaultValue="diff">
                <div className="scroll-thin sticky top-14 z-10 overflow-x-auto bg-background/85 py-2 backdrop-blur"><TabsList><TabsTrigger value="diff">{c.resolution === "closed_by_main" ? "Diff (not merged)" : "Diff"}</TabsTrigger><TabsTrigger value="brief">Fixer brief</TabsTrigger><TabsTrigger value="history">Attempts ({c.attempts.length})</TabsTrigger><TabsTrigger value="replays">Replay runs</TabsTrigger></TabsList></div>
                <TabsContent value="diff" className="pt-3"><FadeRise>{a?.diff ? <DiffViewer diff={a.diff} /> : <EmptyState icon={FileDiff} title="No diff yet" hint="The diff appears when the fixer commits its first attempt." />}</FadeRise></TabsContent>
                <TabsContent value="brief" className="pt-3"><FadeRise>{a?.brief ? <Markdown text={a.brief} /> : <EmptyState icon={FileDiff} title="No fixer brief yet" hint="The brief is written when the fixer is dispatched." />}</FadeRise></TabsContent>
                <TabsContent value="history" className="pt-3"><FadeRise>{c.attempts.length ? <AttemptHistory attempts={c.attempts} /> : <EmptyState icon={ListChecks} title="No attempts yet" hint="Each fixer or reviewer attempt is listed here with its tests, replay and cost." />}</FadeRise></TabsContent>
                <TabsContent value="replays" className="pt-3"><FadeRise>
                  {(a?.replay_runs ?? []).length ? (
                    <ul className="space-y-1.5">{(a?.replay_runs ?? []).map((r) => (
                      <li key={r.run_id} className="flex min-w-0 items-center gap-2"><Tone tone={r.failed ? "fail" : "pass"}>{r.failed ? "fail" : "pass"}</Tone><Link className="mono min-w-0 truncate rounded-sm text-xs text-primary hover:underline" href={`/a/${id}/runs/${r.run_id}`}>{r.run_id}</Link>{r.neatlogs_url && <a className="mono shrink-0 rounded-sm text-xs text-trace hover:underline" href={r.neatlogs_url} target="_blank" rel="noreferrer">trace</a>}</li>
                    ))}</ul>
                  ) : <EmptyState icon={ListChecks} title="No replay runs yet" hint="Replays start after the fixer's tests are green." />}
                </FadeRise></TabsContent>
              </Tabs>
            </div>
          </div>
        );
      }}
    </DataView>
  );
}
