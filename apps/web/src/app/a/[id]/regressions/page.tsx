"use client";
import { use } from "react";
import { useRegressions, useSummary } from "@/lib/api/hooks";
import { BlameCard, RegressionTable } from "@/components/preflight/regressions";
import { EmptyState, SectionHeader } from "@/components/preflight/shared";

export default function Regressions({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data } = useSummary(id);
  const { data: saved } = useRegressions();
  const results = data?.regressions ?? [];
  const bad = results.filter((r) => !r.passed);
  return (
    <div className="space-y-6">
      <SectionHeader title="Regression suite" subtitle="every approved fix becomes a permanent test; if an old failure returns, Entire names the commit that brought it back" />
      {bad.map((r) => <BlameCard key={r.cluster_id} r={r} />)}
      {saved?.length ? <RegressionTable results={results} saved={saved as never} /> : <EmptyState title="No regression tests saved yet" hint="Approve a fix to add its exact failing seeds to the suite." />}
    </div>
  );
}
