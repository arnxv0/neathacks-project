"use client";
import { use } from "react";
import { useRun } from "@/lib/api/hooks";
import { DataView, Markdown, Mono, PageHeader, PANEL, Tone } from "@/components/preflight/shared";
import { RunSkeleton } from "@/components/preflight/shared/skeletons";
import { TraceLink } from "@/components/preflight/clusters";
import { Card, CardContent } from "@/components/ui/card";
import { money, ms } from "@/lib/format";
import type { Verdict } from "@/lib/api/types";

export default function RunPage({ params }: { params: Promise<{ id: string; rid: string }> }) {
  const { id, rid } = use(params);
  const query = useRun(id, rid);
  return (
    <DataView query={query} what="the run" skeleton={<RunSkeleton />}>
      {(data) => {
        const r = data.run;
        return (
          <div>
            <PageHeader title={`Run ${rid}`} subtitle={`${r.attack_id} · ${r.seed_id} · ${r.kind}`}
              crumbs={[{ label: "Scorecard", href: `/a/${id}` }, { label: "Clusters", href: `/a/${id}/clusters?attack=${r.attack_id}` }, { label: rid }]}
              right={r.neatlogs_url ? <TraceLink href={r.neatlogs_url} /> : null}
              meta={<>
                <Tone tone={r.failed ? "fail" : "pass"}>{r.failed ? "attack succeeded" : "attack blocked"}</Tone>
                {Object.values(r.verdicts).map((v: Verdict) => <Tone key={v.grader} tone={v.passed ? "pass" : "fail"}>{v.grader}</Tone>)}
                <Mono>{r.steps} steps · {r.tokens_in + r.tokens_out} tokens · {money(r.usd, 4)} · {ms(r.duration_ms)}</Mono>
              </>} />
            <Card className={PANEL}><CardContent className="p-4 sm:p-5"><Markdown text={data.transcript} /></CardContent></Card>
          </div>
        );
      }}
    </DataView>
  );
}
