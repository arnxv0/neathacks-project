"use client";
import { use } from "react";
import { useRun } from "@/lib/api/hooks";
import { Markdown, Mono, SectionHeader, Tone } from "@/components/preflight/shared";
import { TraceLink } from "@/components/preflight/clusters";
import { Skeleton } from "@/components/ui/skeleton";
import { money, ms } from "@/lib/format";
import type { Verdict } from "@/lib/api/types";

export default function RunPage({ params }: { params: Promise<{ id: string; rid: string }> }) {
  const { id, rid } = use(params);
  const { data } = useRun(id, rid);
  if (!data) return <Skeleton className="h-96" />;
  const r = data.run;
  return (
    <div className="space-y-4">
      <SectionHeader title={`Run ${rid}`} subtitle={`${r.attack_id} · ${r.seed_id} · ${r.kind}`} right={r.neatlogs_url ? <TraceLink href={r.neatlogs_url} /> : null} />
      <div className="flex flex-wrap gap-2">
        <Tone tone={r.failed ? "fail" : "pass"}>{r.failed ? "attack succeeded" : "attack blocked"}</Tone>
        {Object.values(r.verdicts).map((v: Verdict) => <Tone key={v.grader} tone={v.passed ? "pass" : "fail"}>{v.grader}</Tone>)}
        <Mono>{r.steps} steps · {r.tokens_in + r.tokens_out} tokens · {money(r.usd, 4)} · {ms(r.duration_ms)}</Mono>
      </div>
      <Markdown text={data.transcript} />
    </div>
  );
}
