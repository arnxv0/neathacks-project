"use client";
import { Suspense, use } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Layers, X } from "lucide-react";
import { useSummary } from "@/lib/api/hooks";
import { ClusterGrid } from "@/components/preflight/clusters";
import { DataView, EmptyState, PageHeader } from "@/components/preflight/shared";
import { CardGridSkeleton } from "@/components/preflight/shared/skeletons";
import { Button } from "@/components/ui/button";

function ClustersInner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const sp = useSearchParams();
  const attack = sp.get("attack");
  const query = useSummary(id);
  const clear = <Button variant="outline" size="sm" render={<Link href={`/a/${id}/clusters`} />}><X />Show all clusters</Button>;
  return (
    <DataView query={query} what="the clusters" skeleton={<CardGridSkeleton />}>
      {(data) => {
        const list = data.clusters.filter((c) => !attack || c.attack_ids.includes(attack));
        return (
          <div>
            <PageHeader title={attack ? `Clusters for ${attack}` : "Failure clusters"} subtitle="deterministic signature: family × failing graders × tool sequence up to the first violation" right={attack ? clear : undefined} />
            {list.length ? <ClusterGrid clusters={list} id={id} />
              : <EmptyState icon={Layers} title="No clusters" hint={attack ? `${attack} did not produce failures in this assessment.` : "Clusters appear once failed runs have been graded and grouped by root cause."} action={attack ? clear : <Button variant="outline" size="sm" render={<Link href={`/a/${id}/pipeline`} />}>Open the pipeline</Button>} />}
          </div>
        );
      }}
    </DataView>
  );
}

export default function Clusters(props: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={<CardGridSkeleton />}><ClustersInner {...props} /></Suspense>;
}
