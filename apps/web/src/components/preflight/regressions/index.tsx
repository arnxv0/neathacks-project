"use client";
import { motion } from "motion/react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { RegressionResult } from "@/lib/api/types";
import { shortId } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Disclosure, EASE, Markdown, PANEL, Tone, Truncate } from "../shared";

const MotionRow = motion.create(TableRow);

export function RegressionTable({ results, saved }: { results: RegressionResult[]; saved: { cluster_id: string; attack_id: string; fixed_by_commit?: string; seeds: unknown[]; saved_at?: string }[] }) {
  const byId = new Map(results.map((r) => [r.cluster_id, r]));
  return (
    // The registry Table brings its own horizontal scroll container; min-w keeps the columns readable on a phone.
    <Card className={cn(PANEL, "overflow-hidden")}>
      <Table className="min-w-[640px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="label h-10 pl-4">regression test</TableHead><TableHead className="label h-10">attack</TableHead><TableHead className="label h-10 text-right">seeds</TableHead><TableHead className="label h-10">fixed by</TableHead><TableHead className="label h-10 pr-4">last run</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {saved.map((s, i) => { const r = byId.get(s.cluster_id); return (
            <MotionRow key={s.cluster_id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2, ease: EASE, delay: Math.min(i, 20) * 0.025 }} className={cn("transition-colors duration-200", r && !r.passed && "bg-fail/5")}>
              <TableCell className="max-w-[18rem] pl-4"><Truncate text={s.cluster_id} className="mono text-xs text-foreground" /></TableCell>
              <TableCell><Tone tone="muted">{s.attack_id}</Tone></TableCell>
              <TableCell className="mono text-right text-xs">{s.seeds.length}</TableCell>
              <TableCell><Truncate text={s.fixed_by_commit ?? "—"} className="mono w-fit text-xs text-checkpoint">{shortId(s.fixed_by_commit)}</Truncate></TableCell>
              <TableCell className="pr-4">{r ? <Tone tone={r.passed ? "pass" : "fail"}>{r.passed ? "holding" : `REGRESSED · ${r.failed_runs.length} run${r.failed_runs.length === 1 ? "" : "s"}`}</Tone> : <Tone>not run in this assessment</Tone>}</TableCell>
            </MotionRow>); })}
        </TableBody>
      </Table>
    </Card>
  );
}

export function BlameCard({ r }: { r: RegressionResult }) {
  const b = r.blame;
  if (!b) return null;
  const top = b.commits[0];
  return (
    <Card className={cn(PANEL, "border-fail/40 bg-fail/5")}>
      <CardContent className="space-y-3 p-4 sm:p-5">
        <div className="flex min-w-0 items-center gap-2"><Tone tone="fail">regression</Tone><Truncate text={r.cluster_id} className="mono text-xs text-foreground" /></div>
        {top ? <p className="text-sm leading-relaxed break-words">Brought back by <span className="mono text-checkpoint">{top.sha}</span> <span className="text-muted-foreground">“{top.subject}”</span> by {top.author} on <span className="whitespace-nowrap tabular-nums">{top.date}</span>, which touched {b.files.map((f) => <code key={f} className="mono mx-1 inline-block max-w-full rounded bg-muted px-1.5 py-0.5 align-middle text-xs break-all">{f}</code>)}</p>
             : <p className="text-sm text-muted-foreground">No commit after the fix touched the suspected files; the regression is elsewhere.</p>}
        {b.entire && <Disclosure title="what Entire recorded for that commit"><Markdown text={b.entire} /></Disclosure>}
      </CardContent>
    </Card>
  );
}
