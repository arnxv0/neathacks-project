"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Activity, Boxes, Coins, Crosshair, GitBranch, Layers, Menu, Radar, ShieldAlert, Square, TriangleAlert, Workflow } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AnimatedList, AnimatedListItem } from "@/components/ui/animated-list";
import { useAssessments, useStop, useSummary } from "@/lib/api/hooks";
import { useEventStream } from "@/lib/sse/useEventStream";
import type { AssessmentRow, PreflightEvent, SandboxMeta, Summary } from "@/lib/api/types";
import { money, STATE_LABEL, timeAgo } from "@/lib/format";
import { EASE, LiveDot, Mono, StatusBadge, Truncate } from "../shared";
import { startRouteProgress } from "./RouteProgress";

const NAV = [
  { href: "", label: "Scorecard", icon: Radar },
  { href: "/pipeline", label: "Pipeline", icon: Workflow },
  { href: "/clusters", label: "Clusters", icon: Layers },
  { href: "/fixes", label: "Fixes", icon: GitBranch },
  { href: "/regressions", label: "Regressions", icon: ShieldAlert },
  { href: "/cost", label: "Cost", icon: Coins },
];
/** Sections that do not belong to one assessment. */
const WORKSPACE = [{ href: "/targets", label: "Targets", icon: Crosshair }];
const ITEM = "relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors duration-150";
const repoName = (url: string) => url.replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "");

function Brand() {
  return (
    <div className="border-b border-sidebar-border px-5 py-4">
      <Link href="/" className="inline-flex items-center gap-2 rounded-md"><Boxes aria-hidden className="size-5 text-primary" /><span className="font-semibold tracking-tight">Preflight</span></Link>
      <p className="mt-1 text-[11px] text-muted-foreground">attack · trace · fix · prove</p>
    </div>
  );
}

/** Navigation + assessment switcher. Rendered in the fixed sidebar (≥1024px) and in the mobile drawer.
 *  `id` is the assessment in the URL; on pages outside an assessment (Targets) the assessment links point at the latest one. */
function SidebarBody({ id, data, all, onNavigate }: { id?: string; data?: Summary; all?: AssessmentRow[]; onNavigate?: () => void }) {
  const path = usePathname();
  const router = useRouter();
  const navId = id ?? all?.find((a) => a.kind !== "regress" && !a.assessment_id.startsWith("regress-"))?.assessment_id;
  const base = `/a/${navId}`;
  const awaiting = data?.clusters.filter((c) => c.status === "await_approval").length ?? 0;
  const pill = <motion.span layoutId={onNavigate ? "nav-pill-mobile" : "nav-pill"} aria-hidden className="absolute inset-0 rounded-lg bg-accent" transition={{ duration: 0.2, ease: EASE }} />;
  const selectId = onNavigate ? "assessment-select-m" : "assessment-select";
  return (
    <>
      <nav aria-label="Workspace" className="space-y-1 p-3">
        <p className="label px-3 pb-1">workspace</p>
        {WORKSPACE.map((n) => {
          const active = path === n.href || path.startsWith(n.href + "/");
          return (
            <Link key={n.href} href={n.href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={cn(ITEM, active ? "text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground")}>
              {active && pill}
              <n.icon aria-hidden className={cn("relative size-4", active && "text-primary")} /><span className="relative">{n.label}</span>
            </Link>
          );
        })}
      </nav>
      <nav aria-label="Assessment" className="space-y-1 border-t border-sidebar-border p-3">
        <p className="label px-3 pb-1">{id ? "assessment" : "latest assessment"}</p>
        {NAV.map((n) => {
          if (!navId) return <span key={n.href} aria-disabled="true" className={cn(ITEM, "text-muted-foreground/50")}><n.icon aria-hidden className="size-4" />{n.label}</span>;
          const href = base + n.href;
          const active = !!id && (n.href === "" ? path === base : path.startsWith(href));
          return (
            <Link key={n.href} href={href} onClick={onNavigate} aria-current={active ? "page" : undefined}
              className={cn(ITEM, active ? "text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground")}>
              {active && pill}
              <n.icon aria-hidden className={cn("relative size-4", active && "text-primary")} /><span className="relative">{n.label}</span>
              {n.href === "/fixes" && awaiting > 0 && <span className="relative ml-auto rounded-full bg-pending/20 px-1.5 text-[10px] font-medium tabular-nums text-pending" aria-label={`${awaiting} awaiting approval`}>{awaiting}</span>}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto border-t border-sidebar-border p-3">
        <label htmlFor={selectId} className="label mb-1 block px-1">assessments</label>
        <select id={selectId} value={id ?? ""}
          onChange={(e) => { if (!e.target.value) return; startRouteProgress(); router.push(`/a/${e.target.value}`); onNavigate?.(); }}
          className="mono w-full truncate rounded-md border border-input bg-background px-2 py-1.5 text-xs transition-colors hover:border-ring/50">
          {!id && <option value="">{all?.length ? "open an assessment…" : "no assessments yet"}</option>}
          {id && !(all ?? []).some((a) => a.assessment_id === id) && <option value={id}>{id}</option>}
          {(all ?? []).filter((a) => a.kind !== "regress" || a.assessment_id === id).map((a) => <option key={a.assessment_id} value={a.assessment_id}>{a.assessment_id} · {a.label ?? a.mode}</option>)}
        </select>
      </div>
    </>
  );
}

function MobileNav(props: { id?: string; data?: Summary; all?: AssessmentRow[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger render={<SheetTrigger render={<Button variant="ghost" size="icon" className="shrink-0 lg:hidden" aria-label="Open navigation" />} />}><Menu /></TooltipTrigger>
        <TooltipContent>Navigation</TooltipContent>
      </Tooltip>
      <SheetContent side="left" className="w-72 max-w-[85vw] gap-0 bg-sidebar p-0">
        <SheetHeader className="sr-only"><SheetTitle>Navigation</SheetTitle><SheetDescription>Assessment sections and assessment switcher</SheetDescription></SheetHeader>
        <Brand />
        <SidebarBody {...props} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}

/** SSE connection state: connected / reconnecting. */
function LiveIndicator({ connected }: { connected: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span tabIndex={0} role="status" />} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/70 px-2 py-1">
        <LiveDot on={connected} />
        <span className={cn("hidden text-[11px] font-medium sm:inline", connected ? "text-pass" : "text-pending")}>{connected ? "live" : "reconnecting"}</span>
        <span className="sr-only sm:hidden">{connected ? "live" : "reconnecting"}</span>
      </TooltipTrigger>
      <TooltipContent>{connected ? "Event stream connected: every screen updates live" : "Event stream lost: reconnecting every 1.5 s"}</TooltipContent>
    </Tooltip>
  );
}

function StopButton() {
  const stop = useStop();
  const onStop = () => {
    toast.promise(stop.mutateAsync(), { loading: "Setting the kill switch…", success: "Kill switch set: STOP file written", error: (e) => `Stop failed: ${e instanceof Error ? e.message : String(e)}` });
  };
  return (
    <Tooltip>
      <TooltipTrigger render={<Button size="sm" variant="destructive" className="h-8 shrink-0" onClick={onStop} disabled={stop.isPending} aria-label="Stop: set the kill switch" />}>
        {stop.isPending ? <Spinner className="size-3" /> : <Square className="size-3" />}<span className="hidden sm:inline">Stop</span>
      </TooltipTrigger>
      <TooltipContent>Kill switch: writes the STOP file, running work halts cleanly</TooltipContent>
    </Tooltip>
  );
}

/** The sandbox target an assessment ran against: repository name, linking to the target page. Icon only below 640px. */
function TargetChip({ sandbox }: { sandbox: SandboxMeta }) {
  const name = repoName(sandbox.url ?? sandbox.slug);
  return (
    <Tooltip>
      <TooltipTrigger render={<Link href={`/targets/${sandbox.slug}`} aria-label={`Target: ${name}`} />}
        className="inline-flex min-w-0 max-w-[16rem] items-center gap-1.5 rounded-md border border-trace/30 bg-trace/10 px-1.5 py-0.5 text-xs font-medium text-trace transition-colors hover:bg-trace/20 max-sm:shrink-0">
        <Crosshair aria-hidden className="size-3 shrink-0" /><span className="mono hidden truncate sm:inline">{name}</span>
      </TooltipTrigger>
      <TooltipContent>Sandbox target {name}{sandbox.mode ? ` · runs in ${sandbox.mode === "docker" ? "a container" : "a host process"}` : ""}</TooltipContent>
    </Tooltip>
  );
}

function TopBar({ id, data, all, connected, offline }: { id?: string; data?: Summary; all?: AssessmentRow[]; connected: boolean; offline: boolean }) {
  const state: string | undefined = data?.manifest?.state;
  const sandbox: SandboxMeta | undefined = data?.manifest?.sandbox ?? undefined;
  const spent = (data?.cost.target_usd ?? 0) + (data?.cost.preflight_llm_usd ?? 0);
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/80 px-3 backdrop-blur sm:gap-3 sm:px-6">
      <MobileNav id={id} data={data} all={all} />
      {id ? (
        <>
          <LiveIndicator connected={connected} />
          <Truncate text={id} className="mono min-w-[4ch] text-xs text-foreground" />
          {state ? <StatusBadge status={state} className="shrink-0" /> : offline ? <StatusBadge status="offline" className="shrink-0" /> : <span className="h-5 w-14 shrink-0 animate-pulse rounded-md bg-muted" aria-hidden />}
          {sandbox?.slug && <TargetChip sandbox={sandbox} />}
          {state && <span className="hidden shrink-0 text-xs text-muted-foreground xl:inline">{STATE_LABEL[state] ?? state}</span>}
          {data?.manifest?.target_commit && <Mono className="hidden shrink-0 xl:inline">target @ {data.manifest.target_commit}</Mono>}
        </>
      ) : (
        <span className="inline-flex min-w-0 items-center gap-2 text-sm font-medium"><Crosshair aria-hidden className="size-4 shrink-0 text-primary" /><span className="truncate">Targets</span></span>
      )}
      <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
        {id && (
          <Tooltip>
            <TooltipTrigger render={<span tabIndex={0} />} className="mono inline-flex items-center gap-1 rounded-md text-xs text-foreground">
              <Activity aria-hidden className="size-3 text-primary" />{data ? money(spent, 3) : "—"}{data?.cost.cap_usd ? <span className="hidden text-muted-foreground sm:inline">/ {money(data.cost.cap_usd)}</span> : null}
            </TooltipTrigger>
            <TooltipContent>LLM spend this assessment (target + Preflight){data?.cost.cap_usd ? ` vs the ${money(data.cost.cap_usd)} cap` : ""}</TooltipContent>
          </Tooltip>
        )}
        <StopButton />
      </div>
    </header>
  );
}

/** The reason an assessment was refused or stopped (`manifest.error`), shown above every page of that assessment. */
function AssessmentError({ data }: { data?: Summary }) {
  const error: string | undefined = data?.manifest?.error ?? undefined;
  if (!error) return null;
  const code: string | undefined = data?.manifest?.error_code ?? undefined;
  return (
    <Alert variant="destructive" className="mb-5 border-fail/40 bg-fail/5">
      <TriangleAlert aria-hidden />
      <AlertTitle className="flex flex-wrap items-center gap-x-2">This assessment stopped with an error{code ? <span className="mono text-xs font-normal opacity-80">{code}</span> : null}</AlertTitle>
      <AlertDescription className="break-words text-fail/90">{error}</AlertDescription>
    </Alert>
  );
}

/** Live event ticker. Part of the layout (sticky at the bottom of the content column), so it never covers content. */
function EventTicker({ events, connected }: { events: PreflightEvent[]; connected: boolean }) {
  return (
    <footer aria-label="Latest events" className="sticky bottom-0 z-20 flex h-9 items-center gap-3 overflow-hidden border-t border-border bg-sidebar/90 px-3 backdrop-blur sm:px-4">
      <span className="label shrink-0">events</span>
      <div className="fade-right min-w-0 flex-1 overflow-hidden">
        {events.length === 0 ? <span className="mono text-[11px] whitespace-nowrap text-muted-foreground">{connected ? "waiting for events…" : "connecting to the event stream…"}</span> : (
          <AnimatedList delay={400} className="h-9 flex-row items-center justify-start gap-6">
            {events.slice(-6).map((e) => (
              <AnimatedListItem key={e.seq}>
                <span className="mono text-[11px] whitespace-nowrap text-muted-foreground"><span className="text-primary">{e.type}</span>{e.cluster_id ? ` ${e.cluster_id}` : e.run_id ? ` ${e.run_id}` : e.state ? ` ${e.state}` : ""} · {timeAgo(e.ts)}</span>
              </AnimatedListItem>
            ))}
          </AnimatedList>
        )}
      </div>
    </footer>
  );
}

/** The dashboard frame: sidebar, top bar, content, event ticker. With an `id` it is bound to that assessment (summary, SSE);
 *  without one (the Targets area) the same frame renders with the assessment-specific chrome left out. */
export function MissionShell({ id, children }: { id?: string; children: React.ReactNode }) {
  const path = usePathname();
  const { data, error } = useSummary(id ?? "", !!id);
  const { data: all } = useAssessments();
  const { events, connected } = useEventStream(id ?? null);
  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-1.5 focus:text-sm focus:text-primary-foreground">Skip to content</a>
      <aside className="scroll-thin sticky top-0 hidden h-dvh w-60 shrink-0 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar lg:flex">
        <Brand />
        <SidebarBody id={id} data={data} all={all} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar id={id} data={data} all={all} connected={connected} offline={!data && !!error} />
        <main id="main" className="grid-bg min-w-0 flex-1 px-4 pt-5 pb-10 sm:px-6 sm:pt-6">
          <motion.div key={path} className="mx-auto w-full max-w-[1680px]" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: EASE }}>
            {id && <AssessmentError data={data} />}
            {children}
          </motion.div>
        </main>
        {id && <EventTicker events={events} connected={connected} />}
      </div>
    </div>
  );
}
