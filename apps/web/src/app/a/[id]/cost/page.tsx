"use client";
import { use } from "react";
import { useSummary } from "@/lib/api/hooks";
import { CostPanel } from "@/components/preflight/cost";
import { SectionHeader } from "@/components/preflight/shared";
import { Skeleton } from "@/components/ui/skeleton";

export default function Cost({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data } = useSummary(id);
  if (!data) return <Skeleton className="h-64" />;
  return <div className="space-y-6"><SectionHeader title="Cost" subtitle="every LLM call in the loop is metered; these numbers feed the business model" /><CostPanel s={data} /></div>;
}
