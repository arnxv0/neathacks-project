"use client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { RegressionResult } from "@/lib/api/types";
import { shortId } from "@/lib/format";
import { Markdown, Mono, Tone } from "../shared";

export function RegressionTable({ results, saved }: { results: RegressionResult[]; saved: { cluster_id: string; attack_id: string; fixed_by_commit?: string; seeds: unknown[]; saved_at?: string }[] }) {
  const byId = new Map(results.map((r) => [r.cluster_id, r]));
  return (
    <Table>
      <TableHeader><TableRow><TableHead>regression test</TableHead><TableHead>attack</TableHead><TableHead>seeds</TableHead><TableHead>fixed by</TableHead><TableHead>last run</TableHead></TableRow></TableHeader>
      <TableBody>
        {saved.map((s) => { const r = byId.get(s.cluster_id); return (
          <TableRow key={s.cluster_id}>
            <TableCell><Mono className="text-foreground">{s.cluster_id}</Mono></TableCell>
            <TableCell><Tone tone="muted">{s.attack_id}</Tone></TableCell>
            <TableCell>{s.seeds.length}</TableCell>
            <TableCell><Mono className="text-checkpoint">{shortId(s.fixed_by_commit)}</Mono></TableCell>
            <TableCell>{r ? <Tone tone={r.passed ? "pass" : "fail"}>{r.passed ? "holding" : `REGRESSED · ${r.failed_runs.length} run${r.failed_runs.length === 1 ? "" : "s"}`}</Tone> : <Tone>not run in this assessment</Tone>}</TableCell>
          </TableRow>); })}
      </TableBody>
    </Table>
  );
}

export function BlameCard({ r }: { r: RegressionResult }) {
  const b = r.blame;
  if (!b) return null;
  const top = b.commits[0];
  return (
    <Card className="border-fail/40 bg-fail/5">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center gap-2"><Tone tone="fail">regression</Tone><Mono className="text-foreground">{r.cluster_id}</Mono></div>
        {top ? <p className="text-sm">Brought back by <span className="mono text-checkpoint">{top.sha}</span> <span className="text-muted-foreground">“{top.subject}”</span> by {top.author} on {top.date}, which touched {b.files.map((f) => <code key={f} className="mono text-xs mx-1">{f}</code>)}</p>
             : <p className="text-sm text-muted-foreground">No commit after the fix touched the suspected files; the regression is elsewhere.</p>}
        {b.entire && <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">what Entire recorded for that commit</summary><Markdown text={b.entire} /></details>}
      </CardContent>
    </Card>
  );
}
