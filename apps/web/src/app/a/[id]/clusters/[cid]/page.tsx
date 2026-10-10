"use client";
import { use } from "react";
import Link from "next/link";
import { useCluster } from "@/lib/api/hooks";
import { DivergenceMarkdown, DivergenceView, HypothesisCard } from "@/components/preflight/clusters";
import { Mono, SectionHeader, StatusBadge, Tone } from "@/components/preflight/shared";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function ClusterPage({ params }: { params: Promise<{ id: string; cid: string }> }) {
  const { id, cid } = use(params);
  const { data: c } = useCluster(id, cid);
  if (!c) return <Skeleton className="h-96" />;
  return (
    <div className="space-y-6">
      <SectionHeader title={c.attack?.name ?? cid} subtitle={c.attack?.description}
        right={<div className="flex items-center gap-2"><StatusBadge status={c.status} />{c.attack_ids.map((a) => <Tone key={a} tone="fail">{a}</Tone>)}{c.owasp && <Tone tone="muted">{c.owasp}</Tone>}<Button asChild size="sm"><Link href={`/a/${id}/fixes/${cid}`}>Open fix →</Link></Button></div>} />
      <Mono>{cid}</Mono>
      <HypothesisCard c={c} />
      <Tabs defaultValue="divergence">
        <TabsList><TabsTrigger value="divergence">Divergence</TabsTrigger><TabsTrigger value="md">Analyst view</TabsTrigger><TabsTrigger value="runs">Runs ({c.run_ids.length})</TabsTrigger></TabsList>
        <TabsContent value="divergence" className="pt-4"><DivergenceView c={c} /></TabsContent>
        <TabsContent value="md" className="pt-4"><DivergenceMarkdown text={c.divergence_md} /></TabsContent>
        <TabsContent value="runs" className="pt-4"><ul className="space-y-1">{c.run_ids.map((r) => <li key={r}><Link className="mono text-xs text-primary hover:underline" href={`/a/${id}/runs/${r}`}>{r}</Link></li>)}</ul></TabsContent>
      </Tabs>
    </div>
  );
}
