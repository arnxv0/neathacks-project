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
        const backend = list.flatMap((c) => c.attempts).at(-1)?.backend;
        return (
          <div>
            <PageHeader title="Fixer board" subtitle={`one Claude Code fixer per cluster, in parallel${backend ? ` · backend: ${backend}` : ""} · each commit is an Entire checkpoint`} />
            {list.length ? <Stagger className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{list.map((c) => <StaggerItem key={c.cluster_id}><FixCard c={c} id={id} /></StaggerItem>)}</Stagger>
              : <EmptyState icon={Wrench} title="No fixes yet" hint="Fixers start once clusters have a divergence step." action={<Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/a/${id}/pipeline`} />}>Open the pipeline</Button>} />}
          </div>
        );
      }}
    </DataView>
  );
}
