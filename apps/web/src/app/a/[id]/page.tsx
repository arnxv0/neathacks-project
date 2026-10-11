"use client";
import { use } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { useSummary } from "@/lib/api/hooks";
import { FamilyGrid, ScorecardHero } from "@/components/preflight/scorecard";
import { ClusterGrid } from "@/components/preflight/clusters";
import { DataView, EmptyState, SectionHeader } from "@/components/preflight/shared";
import { ScorecardSkeleton } from "@/components/preflight/shared/skeletons";
import { Button } from "@/components/ui/button";

export default function Overview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const query = useSummary(id);
  return (
    <DataView query={query} what="the assessment" skeleton={<ScorecardSkeleton />}>
      {(data) => {
        const running = !["DONE", "STOPPED", "AWAIT_APPROVAL"].includes(data.manifest.state);
        return (
          <div className="space-y-8">
            <h1 className="sr-only">Scorecard</h1>
            <ScorecardHero sc={data.scorecard} after={data.after} running={running} />
            <section><SectionHeader title="Attack matrix" subtitle="P0 catalog, mapped to the OWASP Top 10 for LLM applications" /><FamilyGrid sc={data.scorecard} attacks={data.attacks} runs={data.runs} id={id} after={data.after} /></section>
            <section>
              <SectionHeader title="Failure clusters" subtitle="failed runs grouped by root cause, each with its first divergence step" />
              {data.clusters.length ? <ClusterGrid clusters={data.clusters} id={id} />
                : <EmptyState icon={ShieldCheck} title={running ? "Clustering runs as they finish…" : "No failures clustered"} hint={running ? "Clusters appear here as soon as failed runs are graded." : "Every attack in this assessment was blocked."} action={running ? <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/a/${id}/pipeline`} />}>Watch the pipeline</Button> : undefined} />}
            </section>
          </div>
        );
      }}
    </DataView>
  );
}
