"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { Check, GitCommit, MessageSquareWarning, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { BorderBeam } from "@/components/ui/border-beam";
import { ShineBorder } from "@/components/ui/shine-border";
import { Confetti, type ConfettiRef } from "@/components/ui/confetti";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { money, shortId } from "@/lib/format";
import { api } from "@/lib/api/client";
import { useReview } from "@/lib/api/hooks";
import type { Cluster, FixAttempt } from "@/lib/api/types";
import { CARD_LINK, Markdown, Mono, PANEL, PANEL_LINK, StatusBadge, Tone } from "../shared";

/** The attempt a page should headline: the approved one, else the one that passed replay, else the newest attempt that
 *  is still alive (not aborted/failed), else the newest. The attempts tab keeps the full history. */
export function headlineAttempt(attempts: FixAttempt[]): FixAttempt | undefined {
  const by = (s: string) => [...attempts].reverse().find((a) => a.status === s);
  return by("approved") ?? by("passed") ?? [...attempts].reverse().find((a) => !["aborted", "failed", "rejected"].includes(a.status)) ?? attempts[attempts.length - 1];
}

export function FixCard({ c, id }: { c: Cluster; id: string }) {
  const a = headlineAttempt(c.attempts);
  const running = c.status === "fixing" || a?.status === "running" || a?.status === "replaying";
  const passed = a?.status === "passed" || c.status === "await_approval" || c.status === "merged";
  return (
    <Link href={`/a/${id}/fixes/${c.cluster_id}`} className={CARD_LINK}>
      <Card className={cn(PANEL, PANEL_LINK, "relative overflow-hidden h-full")}>
        {running && <BorderBeam size={120} duration={6} colorFrom="oklch(0.8 0.14 200)" colorTo="oklch(0.72 0.17 300)" />}
        {passed && c.status !== "merged" && <ShineBorder shineColor={["oklch(0.78 0.17 160)", "oklch(0.8 0.14 200)"]} />}
        <CardContent className="p-4 space-y-2">
          <div className="flex items-start justify-between gap-2"><div className="flex min-w-0 flex-wrap gap-1.5">{c.attack_ids.map((x) => <Tone key={x} tone="fail">{x}</Tone>)}</div><StatusBadge status={c.status} /></div>
          <p className="text-sm font-medium leading-snug">{c.attack_name}</p>
          <p className="text-xs text-muted-foreground line-clamp-2">{c.hypothesis}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-1">
            <Mono>attempt {a?.n ?? 0}{a ? ` · ${a.author}` : ""}</Mono>
            {a?.commit && <Mono className="text-checkpoint"><GitCommit className="inline size-3 mr-1" />{shortId(a.commit)}</Mono>}
            {a?.entire_checkpoint_id && <Mono className="text-checkpoint">cp {shortId(a.entire_checkpoint_id, 10)}</Mono>}
            {a?.replay && <ReplayDots replay={a.replay} compact />}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export function ReplayDots({ replay, compact = false, live }: { replay: FixAttempt["replay"]; compact?: boolean; live?: { passed: number; total: number } }) {
  const total = live?.total ?? replay?.total ?? 0;
  const passed = live?.passed ?? replay?.passed ?? 0;
  const [b1, b2] = (replay?.before ?? "0/0").split("/").map(Number);
  return (
    <div className={cn("flex min-w-0 max-w-full flex-wrap items-center gap-x-3 gap-y-1.5", compact ? "text-[11px]" : "text-sm")}>
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        <span className="mono text-muted-foreground mr-1">before</span>
        {Array.from({ length: b2 }).map((_, i) => <span key={i} style={{ animationDelay: `${i * 30}ms` }} className={cn("dot-in shrink-0 rounded-full", compact ? "size-2" : "size-3", i < b1 ? "bg-pass" : "bg-fail")} />)}
        <span className="mono ml-1 text-fail">{replay?.before}</span>
      </div>
      <span aria-hidden className="text-muted-foreground">→</span>
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        <span className="mono text-muted-foreground mr-1">after</span>
        {Array.from({ length: total }).map((_, i) => <span key={i} style={{ animationDelay: `${(b2 + i) * 30}ms` }} className={cn("dot-in shrink-0 rounded-full transition-colors duration-200", compact ? "size-2" : "size-3", i < passed ? "bg-pass" : i < (live ? live.total : total) && live && i >= passed ? "bg-fail" : "bg-muted-foreground/30")} />)}
        <span className={cn("mono ml-1", passed === total && total ? "text-pass" : "text-pending")}>{passed}/{total}</span>
      </div>
    </div>
  );
}

export function DiffViewer({ diff }: { diff: string }) {
  if (!diff) return <p className="text-xs text-muted-foreground">No diff yet.</p>;
  return (
    <div tabIndex={0} role="region" aria-label="Diff" className="scroll-thin max-h-[70vh] overflow-auto rounded-lg border border-border/60 bg-black/30">
      <pre className="mono w-max min-w-full text-[11.5px] leading-5 p-3">
        {diff.split("\n").map((l, i) => (
          <div key={i} className={cn("px-1 -mx-1", l.startsWith("+") && !l.startsWith("+++") ? "diff-add" : l.startsWith("-") && !l.startsWith("---") ? "diff-del" : l.startsWith("@@") ? "diff-hunk" : l.startsWith("diff ") ? "text-foreground font-semibold mt-3" : "text-muted-foreground")}>{l || " "}</div>
        ))}
      </pre>
    </div>
  );
}

export function CheckpointPanel({ a }: { a: FixAttempt }) {
  return (
    <Card className="border-checkpoint/30 bg-checkpoint/5">
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center gap-2"><Tone tone="checkpoint">Entire checkpoint</Tone>{a.entire_checkpoint_id ? <Mono className="text-checkpoint">{a.entire_checkpoint_id}</Mono> : <Mono>linked by commit trailer</Mono>}{a.commit && <Mono>commit {shortId(a.commit)}</Mono>}</div>
        {a.checkpoint_md ? <Markdown text={a.checkpoint_md.slice(0, 4000)} /> : <p className="text-xs text-muted-foreground">Every fixer commit is captured by Entire with the prompt, reasoning and tool calls behind it. Run <code className="mono">entire checkpoint explain {shortId(a.commit ?? "", 8)} --generate</code> in the target repo for the full intent/outcome summary.</p>}
        {a.summary && <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">fixer summary</summary><p className="mt-2 whitespace-pre-wrap">{a.summary}</p></details>}
      </CardContent>
    </Card>
  );
}

export function ReviewActions({ id, c }: { id: string; c: Cluster }) {
  const { approve, reject, requestChanges } = useReview(id, c.cluster_id);
  const [comment, setComment] = useState("");
  const confetti = useRef<ConfettiRef>(null);
  const a = headlineAttempt(c.attempts);
  const canApprove = c.status === "await_approval" && a?.status === "passed";
  const [dialog, setDialog] = useState<"changes" | "reject" | null>(null);
  const busy = approve.isPending || reject.isPending || requestChanges.isPending;
  const fail = (e: unknown) => `Failed: ${e instanceof Error ? e.message : String(e)}`;
  return (
    <div className="flex flex-wrap items-center gap-2 relative">
      <Confetti ref={confetti} manualstart className="pointer-events-none absolute inset-0 -top-40 h-80 w-full" />
      <Button disabled={!canApprove || busy} aria-busy={approve.isPending} onClick={() => toast.promise(approve.mutateAsync().then(() => { confetti.current?.fire({ particleCount: 160, spread: 90 }); }), { loading: "Approving: merging into main…", success: "Approved: merging and saving regression test", error: fail })} className="bg-pass text-background hover:bg-pass/90">{approve.isPending ? <Spinner className="mr-1" /> : <Check className="size-4 mr-1" />}Approve & merge</Button>
      <Dialog open={dialog === "changes"} onOpenChange={(o) => setDialog(o ? "changes" : null)}><DialogTrigger render={<Button variant="outline" disabled={!a || busy} aria-busy={requestChanges.isPending} />}>{requestChanges.isPending ? <Spinner className="mr-1" /> : <MessageSquareWarning className="size-4 mr-1" />}Request changes</DialogTrigger>
        <DialogContent><DialogHeader><DialogTitle>Send the fixer back</DialogTitle><DialogDescription>Your comment goes to the same Claude Code session; it revises, then replay runs again.</DialogDescription></DialogHeader>
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="e.g. Don't special-case the domain; validate recipients against the tenant's allowed domains." rows={4} />
          <DialogFooter><Button onClick={() => { setDialog(null); toast.promise(requestChanges.mutateAsync(comment), { loading: "Sending the fixer back…", success: "Fixer revising…", error: fail }); }} disabled={!comment || busy}>{requestChanges.isPending && <Spinner />}Send</Button></DialogFooter></DialogContent></Dialog>
      <EditSheet id={id} c={c} />
      <Dialog open={dialog === "reject"} onOpenChange={(o) => setDialog(o ? "reject" : null)}><DialogTrigger render={<Button variant="ghost" className="text-fail" disabled={busy} aria-busy={reject.isPending} />}>{reject.isPending ? <Spinner className="mr-1" /> : <X className="size-4 mr-1" />}Reject</DialogTrigger>
        <DialogContent><DialogHeader><DialogTitle>Reject this fix</DialogTitle><DialogDescription>The cluster is marked needs_human and the branch is kept.</DialogDescription></DialogHeader>
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="reason" rows={3} />
          <DialogFooter><Button variant="destructive" disabled={busy} onClick={() => { setDialog(null); toast.promise(reject.mutateAsync(comment || "rejected"), { loading: "Rejecting…", success: "Rejected", error: fail }); }}>{reject.isPending && <Spinner />}Reject</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}

function EditSheet({ id, c }: { id: string; c: Cluster }) {
  const { edit } = useReview(id, c.cluster_id);
  const [files, setFiles] = useState<Record<string, string> | null>(null);
  const load = async () => { const r = await api<{ files: Record<string, string> }>(`/api/assessments/${id}/clusters/${c.cluster_id}/files`); setFiles(r.files); };
  return (
    <Sheet onOpenChange={(o) => o && load()}>
      <SheetTrigger render={<Button variant="outline" disabled={edit.isPending} aria-busy={edit.isPending} />}>{edit.isPending ? <Spinner className="mr-1" /> : <Pencil className="size-4 mr-1" />}Edit myself</SheetTrigger>
      <SheetContent className="w-[min(900px,95vw)] sm:max-w-none overflow-y-auto">
        <SheetHeader><SheetTitle>Edit the fix directly</SheetTitle><SheetDescription>Files changed on <span className="mono">{c.attempts.at(-1)?.branch}</span>. Saving commits as you (Entire records it), then replay runs again before it can be merged.</SheetDescription></SheetHeader>
        <div className="space-y-4 p-4">
          {!files && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Spinner className="size-3" />loading the changed files…</p>}
          {files && Object.entries(files).map(([path, content]) => (
            <div key={path} className="min-w-0"><Mono className="block break-all text-checkpoint">{path}</Mono><Textarea className="mono text-xs mt-1 min-h-[260px]" value={content} onChange={(e) => setFiles({ ...files, [path]: e.target.value })} /></div>
          ))}
          <Button disabled={!files || edit.isPending} onClick={() => files && toast.promise(edit.mutateAsync(files), { loading: "Committing your edit…", success: "Committed; replaying…", error: (e) => `Failed: ${e instanceof Error ? e.message : String(e)}` })}>{edit.isPending && <Spinner />}Save, commit & replay</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function AttemptHistory({ attempts }: { attempts: FixAttempt[] }) {
  return (
    <ol className="space-y-2">
      {attempts.map((a) => (
        <li key={a.n} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-border/60 bg-card/60 px-3 py-2 text-xs">
          <Mono className="text-foreground">#{a.n}</Mono><Tone tone={a.author === "human" ? "checkpoint" : "muted"}>{a.author}</Tone><StatusBadge status={a.status} />
          {a.commit && <Mono>{shortId(a.commit)}</Mono>}{a.tests_green != null && <Tone tone={a.tests_green ? "pass" : "fail"}>tests {a.tests_green ? "green" : "red"}</Tone>}
          {a.replay && <Mono>{a.replay.before} → {a.replay.after}</Mono>}<Mono className="ml-auto">{money(a.cost_usd)}</Mono>
          {a.review_comment && <p className="basis-full break-words text-muted-foreground">reviewer: {a.review_comment}</p>}
        </li>
      ))}
    </ol>
  );
}
