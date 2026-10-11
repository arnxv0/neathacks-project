"use client";
import { Fragment } from "react";
import Link from "next/link";
import type { UseQueryResult } from "@tanstack/react-query";
import { ChevronRight, Inbox, RotateCw, ServerCrash, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { API } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export { FadeRise, Stagger, StaggerItem, EASE, DUR } from "./motion";

/* Type scale (one place): page title = text-xl semibold · section title = text-base semibold ·
   label = .label (11px uppercase) · body = text-sm · mono = .mono text-xs with tabular numerals. */

/** Card chrome shared by every feature: no double vertical padding from the registry Card, one border colour. */
export const PANEL = "gap-0 py-0 border-border/60";
/** Interactive card: lift + border on hover and on keyboard focus of the wrapping link. */
export const PANEL_LINK = "card-lift group-focus-visible/link:border-primary/60";
/** A link that wraps a whole card. */
export const CARD_LINK = "group/link block h-full rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function Mono({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("mono text-xs text-muted-foreground", className)}>{children}</span>;
}

/** Small uppercase label above a value or a block. */
export function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("label", className)}>{children}</p>;
}

/** Single-line text that truncates with an ellipsis and shows the full value in a tooltip (ids, shas, paths). */
export function Truncate({ text, className, children }: { text: string; className?: string; children?: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span tabIndex={0} />} className={cn("block min-w-0 truncate rounded-sm", className)}>{children ?? text}</TooltipTrigger>
      <TooltipContent className="mono max-w-[min(90vw,32rem)] break-all">{text}</TooltipContent>
    </Tooltip>
  );
}

export type Crumb = { label: string; href?: string };

function Crumbs({ items }: { items: Crumb[] }) {
  return (
    <Breadcrumb className="mb-2">
      <BreadcrumbList className="flex-nowrap text-xs">
        {items.map((c, i) => (
          <Fragment key={i}>
            {i > 0 && <BreadcrumbSeparator><ChevronRight /></BreadcrumbSeparator>}
            <BreadcrumbItem className={cn("min-w-0", i < items.length - 1 && "shrink-0")}>
              {c.href ? <BreadcrumbLink render={<Link href={c.href} />} className="rounded-sm">{c.label}</BreadcrumbLink> : <BreadcrumbPage className="mono block truncate">{c.label}</BreadcrumbPage>}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

/** Page title block: breadcrumbs, h1, optional subtitle, and an actions slot that wraps under the title on narrow screens. */
export function PageHeader({ title, subtitle, right, crumbs, meta }: { title: string; subtitle?: React.ReactNode; right?: React.ReactNode; crumbs?: Crumb[]; meta?: React.ReactNode }) {
  return (
    <div className="mb-5">
      {crumbs && <Crumbs items={crumbs} />}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 max-w-3xl flex-1 basis-64">
          <h1 className="text-xl font-semibold tracking-tight break-words">{title}</h1>
          {subtitle && <p className="mt-1 text-sm leading-relaxed text-muted-foreground break-words">{subtitle}</p>}
        </div>
        {right && <div className="flex max-w-full flex-wrap items-center gap-2">{right}</div>}
      </div>
      {meta && <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">{meta}</div>}
    </div>
  );
}

/** Section title inside a page. */
export function SectionHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

/** Empty view: icon, one line, what to do next. */
export function EmptyState({ title, hint, icon: Icon = Inbox, action }: { title: string; hint?: React.ReactNode; icon?: LucideIcon; action?: React.ReactNode }) {
  return (
    <Empty className="border border-border bg-card/40 py-10">
      <EmptyHeader>
        <EmptyMedia variant="icon"><Icon aria-hidden /></EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {hint && <EmptyDescription className="text-xs/relaxed break-words">{hint}</EmptyDescription>}
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}

/** Error view with a Retry button. A network failure (API down) gets its own wording. */
export function ErrorState({ title, error, onRetry, retrying }: { title: string; error: unknown; onRetry?: () => void; retrying?: boolean }) {
  const msg = error instanceof Error ? error.message : String(error);
  const offline = error instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(msg);
  return (
    <Empty role="alert" className="border border-fail/30 bg-fail/5 py-10">
      <EmptyHeader>
        <EmptyMedia variant="icon" className="bg-fail/15 text-fail"><ServerCrash aria-hidden /></EmptyMedia>
        <EmptyTitle>{offline ? "The Preflight API is not reachable" : title}</EmptyTitle>
        <EmptyDescription className="text-xs/relaxed break-words">
          {offline ? <>No response from <span className="mono">{API}</span>. Start it with <span className="mono">preflight web</span>; this view retries on its own every few seconds.</> : msg.slice(0, 300)}
        </EmptyDescription>
      </EmptyHeader>
      {onRetry && (
        <EmptyContent>
          <Button variant="outline" size="sm" onClick={onRetry} disabled={retrying}>{retrying ? <Spinner /> : <RotateCw />}Retry</Button>
        </EmptyContent>
      )}
    </Empty>
  );
}

/** Skeleton while loading, error state with Retry when the request failed and nothing is cached, content otherwise. */
export function DataView<T>({ query, skeleton, what, children }: { query: UseQueryResult<T>; skeleton: React.ReactNode; what: string; children: (data: T) => React.ReactNode }) {
  if (query.data !== undefined) return <>{children(query.data)}</>;
  if (query.error) return <ErrorState title={`Could not load ${what}`} error={query.error} onRetry={() => query.refetch()} retrying={query.isFetching} />;
  return <div aria-busy="true" aria-label={`Loading ${what}`}>{skeleton}</div>;
}

export function LiveDot({ on, className }: { on: boolean; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full transition-colors duration-200", on ? "bg-pass pulse-ring-pass" : "bg-pending animate-pulse", className)} />;
}

const TONE: Record<string, string> = {
  pass: "bg-pass/15 text-pass border-pass/30", fail: "bg-fail/15 text-fail border-fail/30", pending: "bg-pending/15 text-pending border-pending/30",
  trace: "bg-trace/15 text-trace border-trace/30", checkpoint: "bg-checkpoint/15 text-checkpoint border-checkpoint/30", muted: "bg-muted text-muted-foreground border-border",
};
export type ToneName = "pass" | "fail" | "pending" | "trace" | "checkpoint" | "muted";
export function Tone({ tone = "muted", children, className }: { tone?: keyof typeof TONE; children: React.ReactNode; className?: string }) {
  return <Badge variant="outline" className={cn("rounded-md font-medium tabular-nums transition-colors duration-200", TONE[tone], className)}>{children}</Badge>;
}

/** One mapping from every status the API emits to a badge tone, used by every screen. */
const STATUS_TONE: Record<string, ToneName> = {
  merged: "pass", passed: "pass", approved: "pass", DONE: "pass", holding: "pass",
  failed: "fail", rejected: "fail", needs_human: "fail", STOPPED: "fail", regressed: "fail",
  await_approval: "pending", replaying: "pending", fixing: "pending", running: "pending", AWAIT_APPROVAL: "pending", FIX: "pending",
  // targets (sandbox registry): cloning → cloned → onboarding → needs_review → ready | unsupported | error
  ready: "pass", error: "fail", cloning: "pending", onboarding: "pending", needs_review: "pending", cloned: "trace", unsupported: "muted",
};
const ACTIVE = new Set(["replaying", "fixing", "running", "FIX", "ATTACK", "GRADE", "CLUSTER", "DIVERGE", "REGRESSION_SUITE", "VERIFY_AFTER", "REPORT", "BOOT_TARGET", "VERIFY_OWNERSHIP", "INIT", "cloning", "onboarding"]);
export const statusTone = (status: string): ToneName => STATUS_TONE[status] ?? "muted";

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Tone tone={statusTone(status)} className={className}>
      <span aria-hidden className={cn("size-1.5 rounded-full bg-current", ACTIVE.has(status) && "animate-pulse")} />
      {status.replace(/_/g, " ")}
    </Tone>
  );
}

/** Collapsible section with a height animation (Base UI exposes the measured height as a CSS variable). */
export function Disclosure({ title, children, defaultOpen = false, className, tone = "muted" }: { title: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean; className?: string; tone?: "muted" | "checkpoint" }) {
  return (
    <Collapsible defaultOpen={defaultOpen} className={cn("min-w-0 text-xs", className)}>
      <CollapsibleTrigger className={cn("group/disc -mx-1 flex max-w-full items-center gap-1 rounded-md px-1 py-1 text-left outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring", tone === "checkpoint" ? "text-checkpoint" : "text-muted-foreground")}>
        <ChevronRight aria-hidden className="size-3.5 shrink-0 transition-transform duration-200 ease-out group-data-[panel-open]/disc:rotate-90" />
        <span className="min-w-0">{title}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-200 ease-out data-[ending-style]:h-0 data-[ending-style]:opacity-0 data-[starting-style]:h-0 data-[starting-style]:opacity-0">
        <div className="pt-2">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
export function Markdown({ text, className }: { text: string; className?: string }) {
  // tiny markdown: headings, bullets, code fences, inline code, bold, links. Fences are lifted out first so their lines are not re-wrapped.
  const blocks: string[] = [];
  const html = esc(text)
    .replace(/```[^\n]*\n?([\s\S]*?)```/g, (_, c) => { blocks.push(`<pre tabindex="0">${String(c).replace(/\n+$/, "")}</pre>`); return `\u0000${blocks.length - 1}\u0000`; })
    .replace(/^### (.*)$/gm, "<h3>$1</h3>").replace(/^## (.*)$/gm, "<h2>$1</h2>").replace(/^# (.*)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(/^- (.*)$/gm, "<li>$1</li>").replace(/^(?!<h|<li|<pre|<\/|\u0000)(.+)$/gm, "<p>$1</p>")
    .replace(/\u0000(\d+)\u0000/g, (_, i) => blocks[Number(i)]);
  return <div className={cn("prose-md", className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
