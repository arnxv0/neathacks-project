"use client";
import { use } from "react";
import Link from "next/link";
import { Wrench } from "lucide-react";
import { useSummary } from "@/lib/api/hooks";
import { FixCard } from "@/components/preflight/fixes";
import { DataView, EmptyState, PageHeader, Stagger, StaggerItem } from "@/components/preflight/shared";
import { CardGridSkeleton } from "@/components/preflight/shared/skeletons";
import { Button } from "@/components/ui/button";

export default function Fixes({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const query = useSummary(id);
  return (
    <DataView query={query} what="the fixes" skeleton={<CardGridSkeleton />}>
      {(data) => {
        const list = data.clusters;
        const attempts = list.flatMap((c) => c.attempts);
        const backend = attempts.at(-1)?.backend;
        const commits = attempts.filter((a) => a.commit);
        const checkpoints = commits.filter((a) => a.entire_checkpoint_id).length;
        const merged = list.filter((c) => c.resolution === "merged").length;
        const closed = list.filter((c) => c.resolution === "closed_by_main").length;
        const facts = [`${list.length} root cause${list.length === 1 ? "" : "s"}`, `${attempts.length} fix attempt${attempts.length === 1 ? "" : "s"}`,
          ...(merged || closed ? [`${merged} merged${closed ? `, ${closed} closed by main without merging` : ""}`] : []),
          ...(commits.length ? [`${checkpoints} of ${commits.length} commits carry an Entire checkpoint id`] : []), ...(backend ? [`backend: ${backend}`] : [])];
        return (
          <div>
            <PageHeader title="Fixer board" subtitle={`One Claude Code fixer per root cause · ${facts.join(" · ")}`} />
            {list.length ? <Stagger className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{list.map((c) => <StaggerItem key={c.cluster_id}><FixCard c={c} id={id} /></StaggerItem>)}</Stagger>
              : <EmptyState icon={Wrench} title="No fixes yet" hint="Fixers start once clusters have a divergence step." action={<Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/a/${id}/pipeline`} />}>Open the pipeline</Button>} />}
          </div>
        );
      }}
    </DataView>
  );
}
