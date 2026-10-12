"use client";
import { use, useEffect, useState } from "react";
import { useSummary } from "@/lib/api/hooks";
import { useEventStream } from "@/lib/sse/useEventStream";
import { api } from "@/lib/api/client";
import type { PreflightEvent } from "@/lib/api/types";
import { AttackProgress, FixerLanes, LiveFeed, SkippedAttacks, StageTrack, eventsToRows, useStageCounts } from "@/components/preflight/pipeline";
import { DataView, FadeRise, PageHeader, PANEL } from "@/components/preflight/shared";
import { PipelineSkeleton } from "@/components/preflight/shared/skeletons";
import { Card, CardContent } from "@/components/ui/card";

const SUB = "sticky top-14 z-10 mb-2 bg-background/85 py-2 text-sm font-medium backdrop-blur";

export default function Pipeline({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const query = useSummary(id);
  const data = query.data;
  const { events: live } = useEventStream(id);
  const [history, setHistory] = useState<PreflightEvent[]>([]);
  useEffect(() => { api<PreflightEvent[]>(`/api/assessments/${id}/events/history`).then(setHistory).catch(() => setHistory([])); }, [id]);
  const events = [...history, ...live.filter((e) => !history.some((h) => h.seq === e.seq))];
  const counts = useStageCounts(data, events);
  return (
    <DataView query={query} what="the pipeline" skeleton={<PipelineSkeleton />}>
      {(data) => {
        const rows = eventsToRows(events, id, data.attacks, new Set(data.clusters.filter((c) => c.resolution === "closed_by_main").map((c) => c.cluster_id)));
        return (
          <div>
            <PageHeader title="Pipeline" subtitle="every stage of the assessment, live from the event ledger" />
            <div className="space-y-6">
              <Card className={PANEL}><CardContent className="p-4 sm:p-6"><StageTrack state={data.manifest.state} counts={counts} /></CardContent></Card>
              <FadeRise delay={0.05}><Card className={PANEL}><CardContent className="p-4"><AttackProgress s={data} /></CardContent></Card></FadeRise>
              {Array.isArray(data.manifest.attacks_skipped) && data.manifest.attacks_skipped.length > 0 && <SkippedAttacks skipped={data.manifest.attacks_skipped} attacks={data.attacks} />}
              <div className="grid items-start gap-6 lg:grid-cols-5">
                <section className="min-w-0 lg:col-span-2"><h2 className={SUB}>Fixer lanes</h2><FixerLanes s={data} id={id} /></section>
                <section className="min-w-0 lg:col-span-3"><h2 className={SUB}>Live feed</h2><LiveFeed rows={rows} /></section>
              </div>
            </div>
          </div>
        );
      }}
    </DataView>
  );
}
