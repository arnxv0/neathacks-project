"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowRight, Container, ExternalLink, GitCommit, HardDrive, Lock, LockOpen, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { BorderBeam } from "@/components/ui/border-beam";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { shortId } from "@/lib/format";
import type { Target, TargetStack, TargetStatus } from "@/lib/api/types";
import { Mono, PANEL, Tone, Truncate } from "../shared";
import { AnimatedStatus, IndeterminateBar, RunAssessmentDialog } from "./actions";
import { codeText, isBusy, isoAgo, STATUS_HINT } from "./lib";

/** Toasts when a background job finishes (clone done, adapter ready, failure). Compares each poll with the previous one. */
export function useTargetTransitions(targets: Target[] | undefined) {
  const prev = useRef<Map<string, TargetStatus>>(new Map());
  useEffect(() => {
    if (!targets) return;
    for (const t of targets) {
      const was = prev.current.get(t.slug);
      if (was && was !== t.status && isBusy(was)) {
        if (t.status === "cloned") toast.success(`${t.name} cloned and inspected`, { description: "Next: generate the adapter." });
        else if (t.status === "needs_review") toast.success(`${t.name}: adapter ready for review`, { description: "Read the generated files, then approve." });
        else if (t.status === "unsupported") toast.warning(`${t.name} cannot be tested as an agent`, { description: (t.last_error ?? "").slice(0, 200) || undefined });
        else if (t.status === "error") toast.error(`${t.name}: ${was === "cloning" ? "clone" : "onboarding"} failed`, { description: codeText(t.error_code) ?? (t.last_error ?? "").slice(0, 200) });
      }
    }
    prev.current = new Map(targets.map((t) => [t.slug, t.status]));
  }, [targets]);
}

/** Languages, frameworks, servers and the package manager as chips. */
export function StackChips({ stack, max = 6 }: { stack: TargetStack; max?: number }) {
  const chips: { text: string; tone: "trace" | "checkpoint" | "muted" }[] = [
    ...(stack.languages ?? []).map((text) => ({ text, tone: "trace" as const })),
    ...(stack.frameworks ?? []).map((text) => ({ text, tone: "checkpoint" as const })),
    ...(stack.servers ?? []).map((text) => ({ text, tone: "muted" as const })),
    ...(stack.package_manager ? [{ text: stack.package_manager, tone: "muted" as const }] : []),
  ];
  if (!chips.length) return <Mono>no stack detected</Mono>;
  const shown = chips.slice(0, max), rest = chips.slice(max);
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {shown.map((c) => <Tone key={c.tone + c.text} tone={c.tone} className="max-w-full"><span className="truncate">{c.text}</span></Tone>)}
      {rest.length > 0 && (
        <Tooltip>
          <TooltipTrigger render={<span tabIndex={0} />} className="rounded-md"><Tone>+{rest.length}</Tone></TooltipTrigger>
          <TooltipContent>{rest.map((c) => c.text).join(" · ")}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

/** Find-only (default for a sandbox target) or trusted. */
export function TrustBadge({ target }: { target: Pick<Target, "trusted" | "kind"> }) {
  if (target.kind === "builtin") return <Tone tone="pass"><LockOpen aria-hidden className="size-3" />fixers enabled</Tone>;
  return (
    <Tooltip>
      <TooltipTrigger render={<span tabIndex={0} />} className="rounded-md">
        {target.trusted ? <Tone tone="fail"><LockOpen aria-hidden className="size-3" />trusted</Tone> : <Tone tone="muted"><Lock aria-hidden className="size-3" />find-only</Tone>}
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{target.trusted ? "Trusted: fixers may run and it may start without a container." : "Find-only: attacks run in a container, nothing is fixed, no code runs on this machine."}</TooltipContent>
    </Tooltip>
  );
}

const CARD = cn(PANEL, "card-lift relative h-full overflow-hidden focus-within:border-primary/60");
const TITLE = "block min-w-0 truncate rounded-sm text-sm font-medium outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring";

/** The next step for a sandbox target, as the card's primary button. Everything that needs an explanation happens on the detail page. */
function NextAction({ t, dockerAvailable }: { t: Target; dockerAvailable: boolean }) {
  const href = `/targets/${t.slug}`;
  const link = (label: string, variant: "default" | "outline" = "default", busy = false) => (
    <Button size="sm" variant={variant} nativeButton={false} render={<Link href={href} />}>{busy && <Spinner className="size-3" />}{label}{!busy && <ArrowRight />}</Button>
  );
  switch (t.status) {
    case "cloning": return <Button size="sm" variant="outline" disabled aria-busy="true"><Spinner className="size-3" />Cloning…</Button>;
    case "cloned": return link(t.contract_native ? "Review" : "Onboard");
    case "onboarding": return link("Onboarding…", "outline", true);
    case "needs_review": return link("Review adapter");
    case "ready": return <RunAssessmentDialog target={t} label="New assessment" size="sm" disabled={!dockerAvailable && !t.trusted} />;
    default: return link("See details", "outline");
  }
}

export function TargetCard({ t, dockerAvailable }: { t: Target; dockerAvailable: boolean }) {
  const busy = isBusy(t.status);
  const failed = t.status === "error" || t.status === "unsupported";
  const added = isoAgo(t.cloned_at ?? t.updated_at);
  return (
    <Card className={CARD}>
      {busy && <BorderBeam size={120} duration={6} colorFrom="oklch(0.8 0.14 200)" colorTo="oklch(0.72 0.17 300)" />}
      <CardContent className="flex h-full flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger render={<Link href={`/targets/${t.slug}`} />} className={TITLE}>{t.name}</TooltipTrigger>
              <TooltipContent className="mono max-w-[min(90vw,32rem)] break-all">{t.name}</TooltipContent>
            </Tooltip>
            {t.url && (
              <Tooltip>
                <TooltipTrigger render={<a href={t.url} target="_blank" rel="noreferrer" aria-label={`Open ${t.name} on GitHub`} />} className="shrink-0 rounded-sm p-0.5 text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"><ExternalLink aria-hidden className="size-3.5" /></TooltipTrigger>
                <TooltipContent className="mono">{t.url}</TooltipContent>
              </Tooltip>
            )}
          </div>
          <AnimatedStatus status={t.status} />
        </div>
        {t.status === "cloning" ? <IndeterminateBar label={`Cloning ${t.name}`} className="my-1.5" /> : <StackChips stack={t.stack} />}
        <p className={cn("text-xs leading-relaxed", failed ? "text-fail" : "text-muted-foreground")}>
          {failed ? (codeText(t.error_code) ?? (t.last_error ?? STATUS_HINT[t.status]).slice(0, 160)) : STATUS_HINT[t.status]}
        </p>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
            <TrustBadge target={t} />
            {t.head_sha && <Truncate text={t.head_sha} className="mono text-xs text-muted-foreground"><GitCommit aria-hidden className="mr-1 inline size-3" />{shortId(t.head_sha, 7)}</Truncate>}
            {added && <Mono>added {added}</Mono>}
          </div>
          <NextAction t={t} dockerAvailable={dockerAvailable} />
        </div>
      </CardContent>
    </Card>
  );
}

/** The target that ships with Preflight. Always first in the list. */
export function BuiltinCard({ t }: { t: Target }) {
  const available = t.available !== false;
  return (
    <Card className={CARD}>
      <CardContent className="flex h-full flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2"><HardDrive aria-hidden className="size-4 shrink-0 text-primary" /><Truncate text={t.name} className="text-sm font-medium" /></div>
          <AnimatedStatus status={available ? t.status : "error"} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5"><Tone tone="trace">built-in</Tone><Tone>local checkout</Tone></div>
        <p className="text-xs leading-relaxed text-muted-foreground">{available ? "The demo sales agent on this machine. Runs the full pipeline, including fixers." : "Its preflight.yaml was not found at the path below, so it cannot be started."}</p>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-1">
          <div className="flex min-w-0 flex-1 basis-40 flex-wrap items-center gap-x-3 gap-y-1.5">
            <TrustBadge target={t} />
            <Truncate text={t.path} className="mono max-w-full text-xs text-muted-foreground" />
          </div>
          <RunAssessmentDialog target={t} size="sm" variant="outline" disabled={!available} />
        </div>
      </CardContent>
    </Card>
  );
}

/** The reason sandbox targets cannot start right now. Same wording as the API's `docker_unavailable` answer. */
export function DockerWarning({ trusted = false, className }: { trusted?: boolean; className?: string }) {
  return (
    <Alert className={cn("border-pending/40 bg-pending/5 text-pending", className)}>
      <TriangleAlert aria-hidden />
      <AlertTitle className="flex items-center gap-1.5"><Container aria-hidden className="size-3.5" />Docker is not available</AlertTitle>
      <AlertDescription className="break-words text-pending/90">
        The <span className="mono text-xs">docker info</span> check failed on this machine, and third-party code is never started outside a container. Start Docker and this notice clears within 30 seconds.
        {trusted ? <> This target is trusted, so it can still start as a host process if the API runs with <span className="mono text-xs">PREFLIGHT_ALLOW_UNSANDBOXED=1</span>.</> : <> For a repository you own, you can instead mark the target trusted and set <span className="mono text-xs">PREFLIGHT_ALLOW_UNSANDBOXED=1</span>.</>}
      </AlertDescription>
    </Alert>
  );
}
