import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/* Skeletons shaped like the final content, one per data-backed view. Server-safe: also used by the loading.tsx route segments. */

const box = "rounded-xl border border-border/60 bg-card/60";
const times = (n: number) => Array.from({ length: n }, (_, i) => i);

function HeaderSkeleton({ crumbs = false }: { crumbs?: boolean }) {
  return (
    <div className="mb-5 space-y-2">
      {crumbs && <Skeleton className="h-3 w-48" />}
      <Skeleton className="h-6 w-56 max-w-full" />
      <Skeleton className="h-4 w-96 max-w-full" />
    </div>
  );
}

function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn(box, "space-y-3 p-4", className)}>
      <div className="flex items-center justify-between"><Skeleton className="h-5 w-16" /><Skeleton className="h-5 w-16" /></div>
      <Skeleton className="h-4 w-2/3" />
      <div className="space-y-1.5"><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-5/6" /></div>
      <div className="flex gap-3 pt-1"><Skeleton className="h-3 w-12" /><Skeleton className="h-3 w-24" /><Skeleton className="h-3 w-12" /></div>
    </div>
  );
}

export function CardGridSkeleton({ count = 6, header = true }: { count?: number; header?: boolean }) {
  return (
    <div>
      {header && <HeaderSkeleton />}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{times(count).map((i) => <CardSkeleton key={i} />)}</div>
    </div>
  );
}

export function ScorecardSkeleton() {
  return (
    <div className="space-y-8">
      <div className={cn(box, "grid gap-8 p-5 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-end")}>
        <div className="flex flex-wrap items-end gap-x-10 gap-y-6">
          {times(2).map((i) => <div key={i} className="space-y-2"><Skeleton className="h-3 w-40" /><Skeleton className="h-14 w-44" /><Skeleton className="h-4 w-28" /></div>)}
        </div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-2">{times(6).map((i) => <Skeleton key={i} className="h-4 w-24" />)}</div>
      </div>
      <div>
        <div className="mb-3 space-y-2"><Skeleton className="h-5 w-32" /><Skeleton className="h-4 w-80 max-w-full" /></div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {times(8).map((i) => (
            <div key={i} className={cn(box, "space-y-3 p-4")}>
              <div className="flex items-start justify-between"><div className="space-y-1.5"><Skeleton className="h-4 w-28" /><Skeleton className="h-3 w-14" /></div><Skeleton className="h-5 w-10" /></div>
              <div className="flex flex-wrap gap-2">{times(3).map((j) => <Skeleton key={j} className="h-7 w-24" />)}</div>
            </div>
          ))}
        </div>
      </div>
      <CardGridSkeleton header={false} />
    </div>
  );
}

export function PipelineSkeleton() {
  return (
    <div className="space-y-6">
      <HeaderSkeleton />
      <div className={cn(box, "flex justify-between gap-2 overflow-hidden p-6")}>
        {times(11).map((i) => <div key={i} className="flex shrink-0 flex-col items-center gap-2"><Skeleton className="size-11 rounded-full" /><Skeleton className="h-3 w-10" /></div>)}
      </div>
      <div className={cn(box, "space-y-3 p-4")}>
        <Skeleton className="h-4 w-28" />
        <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-10 xl:grid-cols-20">{times(20).map((i) => <Skeleton key={i} className="h-9" />)}</div>
      </div>
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-2">{times(4).map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
        <div className="space-y-1.5 lg:col-span-3">{times(10).map((i) => <Skeleton key={i} className="h-11 rounded-lg" />)}</div>
      </div>
    </div>
  );
}

export function ClusterDetailSkeleton() {
  return (
    <div className="space-y-6">
      <HeaderSkeleton crumbs />
      <div className={cn(box, "space-y-3 p-5")}><Skeleton className="h-3 w-40" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-4/5" /><Skeleton className="h-5 w-56" /></div>
      <Skeleton className="h-8 w-72 max-w-full" />
      <div className="space-y-1.5">{times(8).map((i) => <Skeleton key={i} className="h-9 rounded-lg" />)}</div>
    </div>
  );
}

export function FixDetailSkeleton() {
  return (
    <div className="space-y-6">
      <HeaderSkeleton crumbs />
      <div className={cn(box, "flex flex-col gap-4 p-5 xl:flex-row xl:items-center xl:justify-between")}>
        <div className="space-y-2"><Skeleton className="h-3 w-28" /><Skeleton className="h-5 w-72 max-w-full" /></div>
        <div className="flex flex-wrap gap-2">{times(4).map((i) => <Skeleton key={i} className="h-8 w-32" />)}</div>
      </div>
      <div className={cn(box, "space-y-2 p-4")}><Skeleton className="h-5 w-64 max-w-full" /><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-2/3" /></div>
      <Skeleton className="h-8 w-80 max-w-full" />
      <div className={cn(box, "space-y-2 p-3")}>{times(14).map((i) => <Skeleton key={i} className="h-3.5" style={{ width: `${30 + ((i * 37) % 60)}%` }} />)}</div>
    </div>
  );
}

export function RegressionsSkeleton() {
  return (
    <div className="space-y-6">
      <HeaderSkeleton />
      <div className={cn(box, "divide-y divide-border/60")}>
        <div className="flex gap-6 px-4 py-3">{times(5).map((i) => <Skeleton key={i} className="h-4 flex-1" />)}</div>
        {times(8).map((i) => (
          <div key={i} className="flex items-center gap-6 px-4 py-3"><Skeleton className="h-4 flex-[2]" /><Skeleton className="h-5 w-10" /><Skeleton className="h-4 w-6" /><Skeleton className="h-4 w-16" /><Skeleton className="h-5 w-20" /></div>
        ))}
      </div>
    </div>
  );
}

export function CostSkeleton() {
  return (
    <div className="space-y-6">
      <HeaderSkeleton />
      <div className="grid gap-4 sm:grid-cols-3">
        {times(3).map((i) => <div key={i} className={cn(box, "space-y-2 p-5")}><Skeleton className="h-3 w-32" /><Skeleton className="h-9 w-36" /><Skeleton className="h-3 w-44 max-w-full" /></div>)}
      </div>
      <div className={cn(box, "space-y-3 p-5")}><div className="flex justify-between"><Skeleton className="h-4 w-28" /><Skeleton className="h-4 w-32" /></div><Skeleton className="h-1.5 w-full" /><Skeleton className="h-3 w-3/4" /></div>
      <div className={cn(box, "space-y-3 p-5")}><Skeleton className="h-4 w-64 max-w-full" />{times(4).map((i) => <div key={i} className="flex justify-between"><Skeleton className="h-4 w-48" /><Skeleton className="h-4 w-16" /></div>)}</div>
    </div>
  );
}

export function RunSkeleton() {
  return (
    <div className="space-y-4">
      <HeaderSkeleton crumbs />
      <div className="flex flex-wrap gap-2">{times(4).map((i) => <Skeleton key={i} className="h-5 w-24" />)}</div>
      <div className="space-y-4 pt-2">
        {times(4).map((i) => <div key={i} className="space-y-2"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-4/5" /></div>)}
      </div>
    </div>
  );
}

/** Targets list: header with the Add button, then cards shaped like a target card (name + badge, chips, meta row, action). */
export function TargetsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-64 space-y-2"><Skeleton className="h-6 w-28" /><Skeleton className="h-4 w-[30rem] max-w-full" /></div>
        <Skeleton className="h-8 w-36" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {times(count).map((i) => (
          <div key={i} className={cn(box, "space-y-3 p-4")}>
            <div className="flex items-center justify-between gap-3"><Skeleton className="h-5 w-48 max-w-[60%]" /><Skeleton className="h-5 w-20" /></div>
            <div className="flex flex-wrap gap-1.5">{times(4).map((j) => <Skeleton key={j} className="h-5 w-16" />)}</div>
            <div className="flex gap-3"><Skeleton className="h-3 w-16" /><Skeleton className="h-3 w-24" /></div>
            <div className="flex items-center justify-between pt-1"><Skeleton className="h-5 w-20" /><Skeleton className="h-8 w-28" /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Target detail: breadcrumbs + title, the five-step flow, the action panel, the detected stack. */
export function TargetDetailSkeleton() {
  return (
    <div className="space-y-6">
      <HeaderSkeleton crumbs />
      <div className={cn(box, "flex justify-between gap-2 overflow-hidden p-5")}>
        {times(5).map((i) => <div key={i} className="flex flex-1 flex-col items-center gap-2"><Skeleton className="size-10 rounded-full" /><Skeleton className="h-3 w-14" /></div>)}
      </div>
      <div className={cn(box, "space-y-3 p-5")}><Skeleton className="h-5 w-56 max-w-full" /><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-3/4" /><Skeleton className="h-8 w-32" /></div>
      <div className={cn(box, "grid gap-5 p-5 sm:grid-cols-2")}>
        {times(4).map((i) => <div key={i} className="space-y-2"><Skeleton className="h-3 w-24" /><div className="flex flex-wrap gap-1.5">{times(3).map((j) => <Skeleton key={j} className="h-5 w-20" />)}</div></div>)}
      </div>
    </div>
  );
}

/** Whole-shell placeholder while the assessment layout suspends. `children` replaces the default page skeleton. */
export function ShellSkeleton({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <div className="hidden w-60 shrink-0 border-r border-sidebar-border bg-sidebar p-3 lg:block"><Skeleton className="mb-6 h-8 w-32" />{times(7).map((i) => <Skeleton key={i} className="mb-2 h-8" />)}</div>
      <div className="min-w-0 flex-1"><div className="h-14 border-b border-border" /><div className="p-4 sm:p-6">{children ?? <ScorecardSkeleton />}</div></div>
    </div>
  );
}
