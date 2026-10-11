"use client";
import { use } from "react";
import { useSummary } from "@/lib/api/hooks";
import { CostPanel } from "@/components/preflight/cost";
import { DataView, PageHeader } from "@/components/preflight/shared";
import { CostSkeleton } from "@/components/preflight/shared/skeletons";

export default function Cost({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const query = useSummary(id);
  return (
    <DataView query={query} what="the cost report" skeleton={<CostSkeleton />}>
      {(data) => <div><PageHeader title="Cost" subtitle="every LLM call in the loop is metered; these numbers feed the business model" /><CostPanel s={data} /></div>}
    </DataView>
  );
}
