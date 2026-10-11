"use client";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Check, CircleDot, Container, FileCode2, FileDiff, Minus, ScrollText, ShieldCheck, X } from "lucide-react";
import { BorderBeam } from "@/components/ui/border-beam";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { TargetDetail, TargetRuntime } from "@/lib/api/types";
import { DiffViewer } from "../fixes";
import { Disclosure, EASE, EmptyState, FadeRise, Label, Markdown, Mono, PANEL, Tone, Truncate } from "../shared";
import { ApproveButton, DeleteTargetButton, IndeterminateBar, OnboardButton, RetryCloneButton, RunAssessmentDialog, TrustToggle } from "./actions";
import { DockerWarning } from "./list";
import { codeText, FLOW, flowStates, type StepState } from "./lib";

/** Cloned → Onboarded → Reviewed → Ready → Run, with the current step marked. */
export function FlowStepper({ t }: { t: Pick<TargetDetail, "status" | "contract_native" | "cloned_at"> }) {
  const states = flowStates(t);
  const reached = Math.max(0, states.findLastIndex((s) => s !== "todo"));
  const inset = `${100 / (FLOW.length * 2)}%`;
  const STEP: Record<StepState, string> = {
    done: "border-pass bg-pass/10 text-pass", skipped: "border-border bg-muted text-muted-foreground", active: "pulse-ring border-primary text-primary",
    busy: "border-pending bg-pending/10 text-pending", failed: "border-fail bg-fail/10 text-fail", todo: "border-border text-muted-foreground",
  };
  const WORD: Record<StepState, string> = { done: "done", skipped: "skipped", active: "next", busy: "in progress", failed: "failed", todo: "not yet" };
  return (
    <div className="relative">
      <div aria-hidden className="absolute top-5 h-px bg-border" style={{ left: inset, right: inset }}>
        <motion.div className="h-px origin-left bg-gradient-to-r from-primary via-trace to-pass" initial={false} animate={{ scaleX: reached / (FLOW.length - 1) }} transition={{ duration: 0.6, ease: EASE }} />
      </div>
      <ol aria-label="Target flow" className="relative grid grid-cols-5">
        {FLOW.map((s, i) => {
          const st = states[i];
          return (
            <motion.li key={s.id} aria-current={st === "active" || st === "busy" ? "step" : undefined} className="flex min-w-0 flex-col items-center px-0.5 text-center sm:px-1"
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: EASE, delay: i * 0.04 }}>
              <div className={cn("z-10 flex size-10 items-center justify-center rounded-full border bg-background mono text-[11px] transition-colors duration-300", STEP[st])}>
                {st === "done" ? <Check aria-hidden className="size-4" /> : st === "failed" ? <X aria-hidden className="size-4" /> : st === "busy" ? <Spinner aria-hidden className="size-4" /> : st === "skipped" ? <Minus aria-hidden className="size-4" /> : i + 1}
              </div>
              <p className={cn("mt-2 max-w-full text-[11px] font-medium break-words sm:text-xs", st === "todo" ? "text-muted-foreground" : st === "failed" ? "text-fail" : "text-foreground")}>{s.label}<span className="sr-only">: {WORD[st]}</span></p>
              <p className="hidden max-w-full text-[11px] leading-tight text-balance text-muted-foreground md:block">{st === "skipped" ? "ships its own preflight.yaml" : s.hint}</p>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}

function Group({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return <div className={cn("min-w-0", className)}><Label className="mb-2">{title}</Label>{children}</div>;
}
const none = <Mono>none detected</Mono>;

/** What the static inspection found: languages, frameworks, entry points, the environment variables it expects, notes. */
export function StackPanel({ t }: { t: TargetDetail }) {
  const s = t.stack ?? {};
  const entries = s.entry_points ?? [], env = s.env_vars ?? [], notes = s.notes ?? [];
  const facts: string[] = [
    s.file_count != null ? `${s.file_count} files` : "", s.dependency_count != null ? `${s.dependency_count} dependencies` : "", s.package_manager ? `package manager: ${s.package_manager}` : "",
    s.dockerfile ? `Dockerfile: ${s.dockerfile}` : "no Dockerfile (one is generated)", s.has_tests ? "has tests" : "no tests found",
  ].filter(Boolean);
  return (
    <Card className={PANEL}>
      <CardContent className="grid gap-x-8 gap-y-5 p-4 sm:p-5 md:grid-cols-2">
        <Group title="languages">{s.languages?.length ? <div className="flex flex-wrap gap-1.5">{s.languages.map((x) => <Tone key={x} tone="trace">{x}</Tone>)}</div> : none}</Group>
        <Group title="frameworks and servers">
          {(s.frameworks?.length || s.servers?.length) ? <div className="flex flex-wrap gap-1.5">{(s.frameworks ?? []).map((x) => <Tone key={"f" + x} tone="checkpoint">{x}</Tone>)}{(s.servers ?? []).map((x) => <Tone key={"s" + x}>{x}</Tone>)}</div> : none}
          {s.is_agent_candidate === false && <p className="mt-2 text-xs leading-relaxed text-pending">No LLM or agent framework was found in the dependencies. Onboarding may end as unsupported.</p>}
        </Group>
        <Group title={`entry points${entries.length ? ` (${entries.length})` : ""}`} className="md:col-span-2">
          {entries.length ? (
            <ul className="scroll-thin max-h-56 space-y-1 overflow-y-auto pr-1" tabIndex={0} aria-label="Entry points">
              {entries.map((e) => (
                <li key={e.path + e.kind} className="flex min-w-0 items-center gap-2 rounded-md border border-border/60 bg-card/60 px-2.5 py-1.5">
                  <Tone tone={e.kind === "http_app" ? "pass" : "muted"} className="shrink-0">{e.kind.replace(/_/g, " ")}</Tone>
                  <Truncate text={e.path} className="mono text-xs text-foreground" />
                  {e.detail && <Truncate text={e.detail} className="mono ml-auto hidden max-w-[40%] text-xs text-muted-foreground sm:block" />}
                </li>
              ))}
            </ul>
          ) : none}
        </Group>
        <Group title={`environment variables it expects${env.length ? ` (${env.length})` : ""}`}>
          {env.length ? <div className="flex flex-wrap gap-1.5">{env.map((x) => <Tone key={x} className="mono max-w-full text-[11px]"><span className="truncate">{x}</span></Tone>)}</div> : <Mono>none listed in .env.example</Mono>}
          {env.length > 0 && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Names only. Values on this machine are never passed to the container, except the model gateway settings.</p>}
        </Group>
        <Group title="repository">
          <ul className="space-y-1 text-xs text-muted-foreground">{facts.map((f) => <li key={f} className="break-words">{f}</li>)}</ul>
        </Group>
        {notes.length > 0 && (
          <Group title="inspection notes" className="md:col-span-2">
            <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed text-muted-foreground">{notes.map((n, i) => <li key={i} className="break-words">{n}</li>)}</ul>
          </Group>
        )}
      </CardContent>
    </Card>
  );
}

/** Plain text in the same frame as the diff viewer (manifest, logs). */
export function CodeBlock({ text, label, wrap = false }: { text: string; label: string; wrap?: boolean }) {
  return (
    <div tabIndex={0} role="region" aria-label={label} className="scroll-thin max-h-[min(70vh,640px)] overflow-auto rounded-lg border border-border/60 bg-black/30">
      {/* wrap: session logs are one long JSON line with escaped newlines; show them as lines that wrap */}
      <pre className={cn("mono p-3 text-[11.5px] leading-5 text-muted-foreground", wrap ? "break-all whitespace-pre-wrap" : "w-max min-w-full")}>{wrap ? text.replace(/\\n/g, "\n") : text}</pre>
    </div>
  );
}

/** Seconds since an ISO timestamp, ticking while mounted. */
function useElapsed(iso: string | null | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const start = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(start)) return null;
  const s = Math.max(0, Math.round((now - start) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

function Panel({ children, beam = false, tone }: { children: React.ReactNode; beam?: boolean; tone?: "fail" | "pass" | "pending" }) {
  return (
    <Card className={cn(PANEL, "relative overflow-hidden", tone === "fail" && "border-fail/40 bg-fail/5", tone === "pass" && "border-pass/30", tone === "pending" && "border-pending/40")}>
      {beam && <BorderBeam size={200} duration={5} colorFrom="oklch(0.8 0.14 200)" colorTo="oklch(0.72 0.17 300)" />}
      <CardContent className="space-y-4 p-4 sm:p-5">{children}</CardContent>
    </Card>
  );
}
const H = ({ children }: { children: React.ReactNode }) => <h2 className="text-base font-semibold tracking-tight">{children}</h2>;
const P = ({ children, className }: { children: React.ReactNode; className?: string }) => <p className={cn("max-w-3xl text-sm leading-relaxed text-muted-foreground", className)}>{children}</p>;
const Actions = ({ children }: { children: React.ReactNode }) => <div className="flex flex-wrap items-center gap-2">{children}</div>;

function BusyPanel({ t, kind }: { t: TargetDetail; kind: "cloning" | "onboarding" }) {
  const elapsed = useElapsed(t.updated_at);
  return (
    <Panel beam>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <H><span className="inline-flex items-center gap-2"><Spinner className="size-4 text-primary" />{kind === "cloning" ? "Cloning the repository" : "Writing the adapter"}</span></H>
        {elapsed && <Mono aria-label={`running for ${elapsed}`}>{elapsed}</Mono>}
      </div>
      <IndeterminateBar label={kind === "cloning" ? "Cloning" : "Onboarding"} />
      {kind === "cloning"
        ? <P>A shallow clone into the sandbox folder, then a read-only inspection of its files. Git hooks are disabled and nothing from the repository is executed. Limits: 180 seconds, 300 MB.</P>
        : <P>A Claude Code session confined to the clone is reading the code and writing <span className="mono text-xs text-foreground">preflight.yaml</span> and <span className="mono text-xs text-foreground">preflight_adapter.py</span>. It has file tools only and cannot execute anything. This usually takes one to two minutes; you can leave this page.</P>}
      {kind === "onboarding" && (
        <Disclosure title="Onboarder log (latest output)">
          {t.onboard_log_tail ? <CodeBlock wrap text={t.onboard_log_tail} label="Onboarder log" /> : <Mono>The session writes its output when it finishes. Nothing yet.</Mono>}
        </Disclosure>
      )}
    </Panel>
  );
}

function FailurePanel({ t, onDeleted }: { t: TargetDetail; onDeleted: () => void }) {
  const unsupported = t.status === "unsupported";
  const cloneFailed = !t.cloned_at;
  const plain = codeText(t.error_code);
  return (
    <Panel tone="fail">
      <H>{unsupported ? "This repository cannot be tested as an agent" : cloneFailed ? "The clone failed" : "Onboarding failed"}</H>
      {plain && <P className="text-foreground">{plain}</P>}
      {unsupported && !t.last_error && <P>The onboarder did not find an LLM agent it could wrap. Only Python agents are supported in this version.</P>}
      {t.last_error && (
        <div role="alert" className="scroll-thin max-h-64 overflow-auto rounded-lg border border-fail/30 bg-black/30 p-3" tabIndex={0} aria-label="Error message">
          <p className="mono text-xs leading-relaxed break-words whitespace-pre-wrap text-fail">{t.last_error}</p>
        </div>
      )}
      {t.error_code && <Mono className="block">code: {t.error_code}</Mono>}
      <Actions>
        {cloneFailed ? <RetryCloneButton target={t} /> : <OnboardButton target={t} again variant="outline" />}
        <DeleteTargetButton target={t} onDeleted={onDeleted} />
      </Actions>
      {!cloneFailed && <p className="text-xs text-muted-foreground">Onboarding again starts a new Claude Code session (one to two minutes, billed to your Claude usage).</p>}
      {t.onboard_log_tail && <Disclosure title="Onboarder log"><CodeBlock wrap text={t.onboard_log_tail} label="Onboarder log" /></Disclosure>}
    </Panel>
  );
}

/** Generated manifest, review patch and the onboarder's brief. */
export function ReviewTabs({ t }: { t: TargetDetail }) {
  return (
    <Tabs defaultValue={t.onboard_patch ? "patch" : "manifest"}>
      <div className="scroll-thin overflow-x-auto py-1"><TabsList><TabsTrigger value="patch"><FileDiff aria-hidden />Patch to review</TabsTrigger><TabsTrigger value="manifest"><FileCode2 aria-hidden />preflight.yaml</TabsTrigger><TabsTrigger value="brief"><ScrollText aria-hidden />Onboarder brief</TabsTrigger></TabsList></div>
      <TabsContent value="patch" className="pt-2"><FadeRise>{t.onboard_patch ? <DiffViewer diff={t.onboard_patch} /> : <EmptyState icon={FileDiff} title="No patch recorded" hint={t.contract_native ? "This repository ships its own preflight.yaml, so nothing was generated. Read the manifest tab." : "The review patch is written when onboarding finishes."} />}</FadeRise></TabsContent>
      <TabsContent value="manifest" className="pt-2"><FadeRise>{t.manifest ? <CodeBlock text={t.manifest} label="preflight.yaml" /> : <EmptyState icon={FileCode2} title="No manifest yet" hint="preflight.yaml appears here once the onboarder has written it." />}</FadeRise></TabsContent>
      <TabsContent value="brief" className="pt-2"><FadeRise>{t.brief ? <Markdown text={t.brief} /> : <EmptyState icon={ScrollText} title="No brief" hint="The brief is the instruction the onboarder session received." />}</FadeRise></TabsContent>
    </Tabs>
  );
}

function RuntimeStatus({ runtime }: { runtime: TargetRuntime | null }) {
  const running = !!runtime?.running;
  return (
    <div className="min-w-0">
      <Label className="mb-2">runtime</Label>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
        <Tone tone={running ? "pass" : "muted"}><CircleDot aria-hidden className={cn("size-3", running && "animate-pulse")} />{running ? "running" : "not running"}</Tone>
        {running && runtime?.mode && <Tone tone="trace"><Container aria-hidden className="size-3" />{runtime.mode === "docker" ? "container" : "host process"}</Tone>}
        {running && runtime?.port != null && <Mono>127.0.0.1:{runtime.port}</Mono>}
        {running && runtime?.container && <Truncate text={runtime.container} className="mono text-xs text-muted-foreground" />}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{running ? "An assessment is using it. The container is removed when that assessment ends." : "The container is built and started when an assessment starts, and removed when it ends."}</p>
    </div>
  );
}

/** The panel for the step the target is at: what happens next and the action for it. */
export function StatePanel({ t, onDeleted }: { t: TargetDetail; onDeleted: () => void }) {
  const docker = t.runtime?.docker_available !== false;
  switch (t.status) {
    case "cloning": return <BusyPanel t={t} kind="cloning" />;
    case "onboarding": return <BusyPanel t={t} kind="onboarding" />;
    case "error": case "unsupported": return <FailurePanel t={t} onDeleted={onDeleted} />;
    case "cloned":
      return t.contract_native ? (
        <Panel><H>Ships its own manifest</H><P>This repository already contains a <span className="mono text-xs text-foreground">preflight.yaml</span>. It still needs your review before it can run.</P><ReviewTabs t={t} /></Panel>
      ) : (
        <Panel>
          <H>Onboard: generate the adapter</H>
          <P>A Claude Code session confined to the clone writes two files, <span className="mono text-xs text-foreground">preflight.yaml</span> (what the agent is and how to start it) and <span className="mono text-xs text-foreground">preflight_adapter.py</span> (a small HTTP wrapper around it). The session has file tools only: it cannot execute code, open the network or read anything outside the clone. It usually takes one to two minutes and uses your Claude plan.</P>
          <Actions><OnboardButton target={t} /><span className="text-xs text-muted-foreground">Nothing runs afterwards until you approve the result.</span></Actions>
        </Panel>
      );
    case "needs_review":
      return (
        <Panel tone="pending">
          <H>Review the generated adapter</H>
          <P>{t.contract_native ? "This repository ships its own manifest. Read it below." : "The onboarder wrote the files below into the clone. Read the patch: it is everything that was added or changed."}</P>
          <div className="flex gap-2 rounded-lg border border-pending/30 bg-pending/5 p-3 text-sm leading-relaxed">
            <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-pending" />
            <p><span className="font-medium text-foreground">Approving lets this code run in a container on this machine.</span> <span className="text-muted-foreground">The approval is bound to exactly these files; if any file changes afterwards, the target comes back here for another review.</span></p>
          </div>
          <Actions><ApproveButton target={t} /><DeleteTargetButton target={t} onDeleted={onDeleted} variant="outline" /></Actions>
          <ReviewTabs t={t} />
          {t.onboard_log_tail && <Disclosure title="Onboarder log"><CodeBlock wrap text={t.onboard_log_tail} label="Onboarder log" /></Disclosure>}
        </Panel>
      );
    case "ready":
      return (
        <div className="space-y-6">
          {!docker && <DockerWarning trusted={t.trusted} />}
          <Panel tone="pass">
            <H>Ready to run</H>
            <P>{t.trusted ? "Approved and trusted. From here an assessment still runs find-only: attacks, grading and clustering, no fixers." : "Approved. An assessment runs the attacks that apply to this agent inside a container and reports the findings. Nothing is fixed and no code runs on this machine outside the container."}</P>
            <Actions><RunAssessmentDialog target={t} disabled={!docker && !t.trusted} />{!docker && !t.trusted && <span className="text-xs text-pending">Start Docker to enable this.</span>}</Actions>
            <div className="grid gap-x-8 gap-y-5 border-t border-border/60 pt-4 md:grid-cols-2">
              <RuntimeStatus runtime={t.runtime} />
              <div className="min-w-0"><Label className="mb-2">trust</Label><TrustToggle target={t} /></div>
            </div>
          </Panel>
          <Disclosure title="Approved adapter: patch, manifest and brief"><ReviewTabs t={t} /></Disclosure>
        </div>
      );
    default: return null;
  }
}
