"use client";
import { use } from "react";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { useRegressions, useSummary } from "@/lib/api/hooks";
import { BlameCard, RegressionTable } from "@/components/preflight/regressions";
import { DataView, EmptyState, ErrorState, PageHeader, Stagger, StaggerItem } from "@/components/preflight/shared";
import { RegressionsSkeleton } from "@/components/preflight/shared/skeletons";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function Regressions({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const query = useSummary(id);
  const suite = useRegressions();
  return (
    <DataView query={query} what="the regression suite" skeleton={<RegressionsSkeleton />}>
      {(data) => {
        const results = data.regressions ?? [];
        const bad = results.filter((r) => !r.passed);
        const saved = suite.data;
        return (
          <div>
            <PageHeader title="Regression suite" subtitle="every approved fix becomes a permanent test; if an old failure returns, git names the commits that touched the suspected files and Entire adds the reasoning when it has a checkpoint" />
            <div className="space-y-6">
              {bad.length > 0 && <Stagger className="space-y-4">{bad.map((r) => <StaggerItem key={r.cluster_id}><BlameCard r={r} /></StaggerItem>)}</Stagger>}
              {saved === undefined ? (suite.error ? <ErrorState title="Could not load the saved regression tests" error={suite.error} onRetry={() => suite.refetch()} retrying={suite.isFetching} /> : <Skeleton className="h-80 rounded-xl" />)
                : saved.length ? <RegressionTable results={results} saved={saved as never} />
                : <EmptyState icon={ShieldAlert} title="No regression tests saved yet" hint="Approve a fix to add its exact failing seeds to the suite." action={<Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/a/${id}/fixes`} />}>Review fixes</Button>} />}
            </div>
          </div>
        );
      }}
    </DataView>
  );
}
