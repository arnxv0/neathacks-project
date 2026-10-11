"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Activity, Boxes, Coins, GitBranch, Layers, Menu, Radar, ShieldAlert, Square, Workflow } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AnimatedList, AnimatedListItem } from "@/components/ui/animated-list";
import { useAssessments, useStop, useSummary } from "@/lib/api/hooks";
import { useEventStream } from "@/lib/sse/useEventStream";
import type { AssessmentRow, PreflightEvent, Summary } from "@/lib/api/types";
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

function Brand() {
  return (
    <div className="border-b border-sidebar-border px-5 py-4">
      <Link href="/" className="inline-flex items-center gap-2 rounded-md"><Boxes aria-hidden className="size-5 text-primary" /><span className="font-semibold tracking-tight">Preflight</span></Link>
      <p className="mt-1 text-[11px] text-muted-foreground">attack · trace · fix · prove</p>
    </div>
  );
}

/** Navigation + assessment switcher. Rendered in the fixed sidebar (≥1024px) and in the mobile drawer. */
function SidebarBody({ id, data, all, onNavigate }: { id: string; data?: Summary; all?: AssessmentRow[]; onNavigate?: () => void }) {
  const path = usePathname();
  const router = useRouter();
  const base = `/a/${id}`;
  const awaiting = data?.clusters.filter((c) => c.status === "await_approval").length ?? 0;
  return (
    <>
      <nav aria-label="Assessment" className="space-y-1 p-3">
        {NAV.map((n) => {
          const href = base + n.href;
          const active = n.href === "" ? path === base : path.startsWith(href);
          return (
            <Link key={n.href} href={href} onClick={onNavigate} aria-current={active ? "page" : undefined}
              className={cn("relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors duration-150", active ? "text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground")}>
              {active && <motion.span layoutId={onNavigate ? "nav-pill-mobile" : "nav-pill"} aria-hidden className="absolute inset-0 rounded-lg bg-accent" transition={{ duration: 0.2, ease: EASE }} />}
              <n.icon aria-hidden className={cn("relative size-4", active && "text-primary")} /><span className="relative">{n.label}</span>
              {n.href === "/fixes" && awaiting > 0 && <span className="relative ml-auto rounded-full bg-pending/20 px-1.5 text-[10px] font-medium tabular-nums text-pending" aria-label={`${awaiting} awaiting approval`}>{awaiting}</span>}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto border-t border-sidebar-border p-3">
        <label htmlFor={onNavigate ? "assessment-select-m" : "assessment-select"} className="label mb-1 block px-1">assessments</label>
        <select id={onNavigate ? "assessment-select-m" : "assessment-select"} value={id}
          onChange={(e) => { startRouteProgress(); router.push(`/a/${e.target.value}`); onNavigate?.(); }}
          className="mono w-full truncate rounded-md border border-input bg-background px-2 py-1.5 text-xs transition-colors hover:border-ring/50">
          {!(all ?? []).some((a) => a.assessment_id === id) && <option value={id}>{id}</option>}
          {(all ?? []).filter((a) => a.kind !== "regress" || a.assessment_id === id).map((a) => <option key={a.assessment_id} value={a.assessment_id}>{a.assessment_id} · {a.label ?? a.mode}</option>)}
        </select>
      </div>
    </>
  );
}

function MobileNav(props: { id: string; data?: Summary; all?: AssessmentRow[] }) {
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

function TopBar({ id, data, all, connected, offline }: { id: string; data?: Summary; all?: AssessmentRow[]; connected: boolean; offline: boolean }) {
  const state: string | undefined = data?.manifest?.state;
  const spent = (data?.cost.target_usd ?? 0) + (data?.cost.preflight_llm_usd ?? 0);
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/80 px-3 backdrop-blur sm:gap-3 sm:px-6">
      <MobileNav id={id} data={data} all={all} />
      <LiveIndicator connected={connected} />
      <Truncate text={id} className="mono min-w-[4ch] text-xs text-foreground" />
      {state ? <StatusBadge status={state} className="shrink-0" /> : offline ? <StatusBadge status="offline" className="shrink-0" /> : <span className="h-5 w-14 shrink-0 animate-pulse rounded-md bg-muted" aria-hidden />}
      {state && <span className="hidden shrink-0 text-xs text-muted-foreground xl:inline">{STATE_LABEL[state] ?? state}</span>}
      {data?.manifest?.target_commit && <Mono className="hidden shrink-0 xl:inline">target @ {data.manifest.target_commit}</Mono>}
      <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
        <Tooltip>
          <TooltipTrigger render={<span tabIndex={0} />} className="mono inline-flex items-center gap-1 rounded-md text-xs text-foreground">
            <Activity aria-hidden className="size-3 text-primary" />{data ? money(spent, 3) : "—"}{data?.cost.cap_usd ? <span className="hidden text-muted-foreground sm:inline">/ {money(data.cost.cap_usd)}</span> : null}
          </TooltipTrigger>
          <TooltipContent>LLM spend this assessment (target + Preflight){data?.cost.cap_usd ? ` vs the ${money(data.cost.cap_usd)} cap` : ""}</TooltipContent>
        </Tooltip>
        <StopButton />
      </div>
    </header>
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

export function MissionShell({ id, children }: { id: string; children: React.ReactNode }) {
  const path = usePathname();
  const { data, error } = useSummary(id);
  const { data: all } = useAssessments();
  const { events, connected } = useEventStream(id);
  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-1.5 focus:text-sm focus:text-primary-foreground">Skip to content</a>
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <Brand />
        <SidebarBody id={id} data={data} all={all} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar id={id} data={data} all={all} connected={connected} offline={!data && !!error} />
        <main id="main" className="grid-bg min-w-0 flex-1 px-4 pt-5 pb-10 sm:px-6 sm:pt-6">
          <motion.div key={path} className="mx-auto w-full max-w-[1680px]" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: EASE }}>
            {children}
          </motion.div>
        </main>
        <EventTicker events={events} connected={connected} />
      </div>
    </div>
  );
}
