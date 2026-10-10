"use client";
import { use } from "react";
import { useSummary } from "@/lib/api/hooks";
import { FixCard } from "@/components/preflight/fixes";
import { EmptyState, SectionHeader } from "@/components/preflight/shared";

export default function Fixes({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data } = useSummary(id);
  const list = data?.clusters ?? [];
  const backend = list.flatMap((c) => c.attempts).at(-1)?.backend;
  return (
    <div>
      <SectionHeader title="Fixer board" subtitle={`one Claude Code fixer per cluster, in parallel${backend ? ` · backend: ${backend}` : ""} · each commit is an Entire checkpoint`} />
      {list.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{list.map((c) => <FixCard key={c.cluster_id} c={c} id={id} />)}</div> : <EmptyState title="No fixes yet" hint="Fixers start once clusters have a divergence step." />}
    </div>
  );
}
