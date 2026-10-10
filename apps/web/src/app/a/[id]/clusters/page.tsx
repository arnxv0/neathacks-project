"use client";
import { use } from "react";
import { useSearchParams } from "next/navigation";
import { useSummary } from "@/lib/api/hooks";
import { ClusterCard } from "@/components/preflight/clusters";
import { EmptyState, SectionHeader } from "@/components/preflight/shared";

export default function Clusters({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const sp = useSearchParams();
  const attack = sp.get("attack");
  const { data } = useSummary(id);
  const list = (data?.clusters ?? []).filter((c) => !attack || c.attack_ids.includes(attack));
  return (
    <div>
      <SectionHeader title={attack ? `Clusters for ${attack}` : "Failure clusters"} subtitle="deterministic signature: family × failing graders × tool sequence up to the first violation" />
      {list.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{list.map((c) => <ClusterCard key={c.cluster_id} c={c} id={id} />)}</div> : <EmptyState title="No clusters" hint={attack ? `${attack} did not produce failures in this assessment.` : undefined} />}
    </div>
  );
}
