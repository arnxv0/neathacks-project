"use client";
import { use } from "react";
import Link from "next/link";
import { ArrowRight, ListTree } from "lucide-react";
import { useCluster } from "@/lib/api/hooks";
import { DivergenceMarkdown, DivergenceView, HypothesisCard } from "@/components/preflight/clusters";
import { DataView, EmptyState, FadeRise, PageHeader, StatusBadge, Tone, Truncate } from "@/components/preflight/shared";
import { ClusterDetailSkeleton } from "@/components/preflight/shared/skeletons";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

export default function ClusterPage({ params }: { params: Promise<{ id: string; cid: string }> }) {
  const { id, cid } = use(params);
  const query = useCluster(id, cid);
  return (
    <DataView query={query} what="the cluster" skeleton={<ClusterDetailSkeleton />}>
      {(c) => (
        <div>
          <PageHeader title={c.attack?.name ?? cid} subtitle={c.attack?.description}
            crumbs={[{ label: "Scorecard", href: `/a/${id}` }, { label: "Clusters", href: `/a/${id}/clusters` }, { label: cid }]}
            right={<Button size="sm" nativeButton={false} render={<Link href={`/a/${id}/fixes/${cid}`} />}>Open fix<ArrowRight /></Button>}
            meta={<><StatusBadge status={c.status} />{c.attack_ids.map((a) => <Tone key={a} tone="fail">{a}</Tone>)}{c.owasp && <Tone tone="muted">{c.owasp}</Tone>}<Truncate text={cid} className="mono text-xs text-muted-foreground" /></>} />
          <div className="space-y-6">
            <HypothesisCard c={c} />
            <Tabs defaultValue="divergence">
              <div className="sticky top-14 z-10 bg-background/85 py-2 backdrop-blur"><TabsList><TabsTrigger value="divergence">Divergence</TabsTrigger><TabsTrigger value="md">Analyst view</TabsTrigger><TabsTrigger value="runs">Runs ({c.run_ids.length})</TabsTrigger></TabsList></div>
              <TabsContent value="divergence" className="pt-3"><FadeRise><DivergenceView c={c} /></FadeRise></TabsContent>
              <TabsContent value="md" className="pt-3"><FadeRise>{c.divergence_md ? <DivergenceMarkdown text={c.divergence_md} /> : <EmptyState icon={ListTree} title="No analyst view yet" hint="It is written when the divergence step has been computed." />}</FadeRise></TabsContent>
              <TabsContent value="runs" className="pt-3"><FadeRise>
                {c.run_ids.length ? <ul className="space-y-1">{c.run_ids.map((r) => <li key={r} className="min-w-0"><Link className="mono block truncate rounded-sm text-xs text-primary hover:underline" href={`/a/${id}/runs/${r}`}>{r}</Link></li>)}</ul>
                  : <EmptyState icon={ListTree} title="No runs in this cluster" />}
              </FadeRise></TabsContent>
            </Tabs>
          </div>
        </div>
      )}
    </DataView>
  );
}
