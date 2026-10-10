"use client";
import { use } from "react";
import { useSummary } from "@/lib/api/hooks";
import { FamilyGrid, ScorecardHero } from "@/components/preflight/scorecard";
import { ClusterCard } from "@/components/preflight/clusters";
import { EmptyState, SectionHeader } from "@/components/preflight/shared";
import { Skeleton } from "@/components/ui/skeleton";

export default function Overview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error } = useSummary(id);
  if (error) return <EmptyState title="Could not load assessment" hint={String(error)} />;
  if (!data) return <div className="space-y-4"><Skeleton className="h-40" /><Skeleton className="h-64" /></div>;
  const running = !["DONE", "STOPPED", "AWAIT_APPROVAL"].includes(data.manifest.state);
  return (
    <div className="space-y-8">
      <ScorecardHero sc={data.scorecard} after={data.after} running={running} />
      <section><SectionHeader title="Attack matrix" subtitle="P0 catalog, mapped to the OWASP Top 10 for LLM applications" /><FamilyGrid sc={data.scorecard} attacks={data.attacks} runs={data.runs} id={id} after={data.after} /></section>
      <section>
        <SectionHeader title="Failure clusters" subtitle="failed runs grouped by root cause, each with its first divergence step" />
        {data.clusters.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.clusters.map((c) => <ClusterCard key={c.cluster_id} c={c} id={id} />)}</div> : <EmptyState title={running ? "Clustering runs as they finish…" : "No failures clustered"} />}
      </section>
    </div>
  );
}
