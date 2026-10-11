"use client";
import { use, useEffect, useState } from "react";
import { useSummary } from "@/lib/api/hooks";
import { useEventStream } from "@/lib/sse/useEventStream";
import { api } from "@/lib/api/client";
import type { PreflightEvent } from "@/lib/api/types";
import { AttackProgress, FixerLanes, LiveFeed, StageTrack, eventsToRows, useStageCounts } from "@/components/preflight/pipeline";
import { SectionHeader } from "@/components/preflight/shared";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function Pipeline({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data } = useSummary(id);
  const { events: live } = useEventStream(id);
  const [history, setHistory] = useState<PreflightEvent[]>([]);
  useEffect(() => { api<PreflightEvent[]>(`/api/assessments/${id}/events/history`).then(setHistory).catch(() => setHistory([])); }, [id]);
  const events = [...history, ...live.filter((e) => !history.some((h) => h.seq === e.seq))];
  const counts = useStageCounts(data, events);
  if (!data) return <Skeleton className="h-96" />;
  const rows = eventsToRows(events, id, data.attacks);
  return (
    <div className="space-y-6">
      <SectionHeader title="Pipeline" subtitle="every stage of the assessment, live from the event ledger" />
      <Card className="border-border/60"><CardContent className="p-6"><StageTrack state={data.manifest.state} counts={counts} /></CardContent></Card>
      <Card className="border-border/60"><CardContent className="p-4"><AttackProgress s={data} /></CardContent></Card>
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2"><p className="text-sm font-medium mb-2">fixer lanes</p><FixerLanes s={data} id={id} /></div>
        <div className="lg:col-span-3"><p className="text-sm font-medium mb-2">live feed</p><LiveFeed rows={rows} /></div>
      </div>
    </div>
  );
}
