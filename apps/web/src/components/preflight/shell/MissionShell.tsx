"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Activity, Boxes, Coins, GitBranch, Layers, Radar, ShieldAlert, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAssessments, useStop, useSummary } from "@/lib/api/hooks";
import { useEventStream } from "@/lib/sse/useEventStream";
import { money, STATE_LABEL, timeAgo } from "@/lib/format";
import { LiveDot, Mono, StatusBadge } from "../shared";
import { toast } from "sonner";
import { AnimatedList, AnimatedListItem } from "@/components/ui/animated-list";

const NAV = [
  { href: "", label: "Scorecard", icon: Radar },
  { href: "/clusters", label: "Clusters", icon: Layers },
  { href: "/fixes", label: "Fixes", icon: GitBranch },
  { href: "/regressions", label: "Regressions", icon: ShieldAlert },
  { href: "/cost", label: "Cost", icon: Coins },
];

export function MissionShell({ id, children }: { id: string; children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { data } = useSummary(id);
  const { data: all } = useAssessments();
  const { events, connected } = useEventStream(id);
  const stop = useStop();
  const state = data?.manifest?.state ?? "…";
  const spent = (data?.cost.target_usd ?? 0) + (data?.cost.preflight_llm_usd ?? 0);
  const base = `/a/${id}`;
  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 border-r border-sidebar-border bg-sidebar flex flex-col">
        <div className="px-5 py-5 border-b border-sidebar-border">
          <Link href="/" className="flex items-center gap-2"><Boxes className="size-5 text-primary" /><span className="font-semibold tracking-tight">Preflight</span></Link>
          <p className="text-[11px] text-muted-foreground mt-1">attack · trace · fix · prove</p>
        </div>
        <nav className="p-3 space-y-1">
          {NAV.map((n) => {
            const href = base + n.href;
            const active = n.href === "" ? path === base : path.startsWith(href);
            return (
              <Link key={n.href} href={href} className={cn("flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors", active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground")}>
                <n.icon className="size-4" />{n.label}
                {n.href === "/fixes" && data && data.clusters.some((c) => c.status === "await_approval") && <span className="ml-auto size-2 rounded-full bg-pending" />}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto p-3 border-t border-sidebar-border">
          <p className="px-2 text-[11px] uppercase tracking-wider text-muted-foreground mb-1">assessments</p>
          <select value={id} onChange={(e) => router.push(`/a/${e.target.value}`)} className="w-full rounded-md bg-background border border-input px-2 py-1.5 text-xs mono">
            {(all ?? []).filter((a) => a.kind !== "regress").map((a) => <option key={a.assessment_id} value={a.assessment_id}>{a.assessment_id} · {a.label ?? a.mode}</option>)}
          </select>
        </div>
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border flex items-center gap-4 px-6 bg-background/80 backdrop-blur sticky top-0 z-20">
          <LiveDot on={connected} />
          <Mono className="text-foreground">{id}</Mono>
          <StatusBadge status={state} />
          <span className="text-xs text-muted-foreground hidden md:inline">{STATE_LABEL[state] ?? state}</span>
          {data?.manifest?.target_commit && <Mono>target @ {data.manifest.target_commit}</Mono>}
          <div className="ml-auto flex items-center gap-3">
            <Tooltip><TooltipTrigger asChild><Mono className="text-foreground"><Activity className="inline size-3 mr-1 text-primary" />{money(spent, 3)}{data?.cost.cap_usd ? <span className="text-muted-foreground"> / {money(data.cost.cap_usd)}</span> : null}</Mono></TooltipTrigger><TooltipContent>LLM spend this assessment (target + Preflight) vs cap</TooltipContent></Tooltip>
            <Button size="sm" variant="destructive" className="h-8" onClick={() => stop.mutate(undefined, { onSuccess: () => toast.warning("Kill switch set: STOP file written") })}><Square className="size-3 mr-1" />Stop</Button>
          </div>
        </header>
        <main className="flex-1 p-6 grid-bg">{children}</main>
        <footer className="border-t border-border bg-sidebar/60 h-9 flex items-center px-4 overflow-hidden">
          <AnimatedList delay={400} className="flex-row gap-6 h-9 items-center overflow-hidden">
            {events.slice(-6).map((e) => (
              <AnimatedListItem key={e.seq}>
                <span className="mono text-[11px] text-muted-foreground whitespace-nowrap"><span className="text-primary">{e.type}</span>{e.cluster_id ? ` ${e.cluster_id}` : e.run_id ? ` ${e.run_id}` : e.state ? ` ${e.state}` : ""} · {timeAgo(e.ts)}</span>
              </AnimatedListItem>
            ))}
          </AnimatedList>
        </footer>
      </div>
    </div>
  );
}
