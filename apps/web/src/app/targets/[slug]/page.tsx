"use client";
import { use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, GitCommit, SearchX } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useTarget } from "@/lib/api/hooks";
import { shortId } from "@/lib/format";
import { AnimatedStatus, DeleteTargetButton, FlowStepper, StackPanel, StatePanel, STATUS_HINT, TrustBadge, isoAgo, useTargetTransitions } from "@/components/preflight/targets";
import { DataView, Disclosure, EmptyState, FadeRise, Mono, PageHeader, PANEL, SectionHeader, Truncate } from "@/components/preflight/shared";
import { TargetDetailSkeleton } from "@/components/preflight/shared/skeletons";
import { startRouteProgress } from "@/components/preflight/shell/RouteProgress";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function TargetPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();
  const query = useTarget(slug);
  useTargetTransitions(query.data ? [query.data] : undefined);
  const back = () => { startRouteProgress(); router.push("/targets"); };
  const backLink = <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/targets" />}><ArrowLeft />All targets</Button>;

  // A target that was deleted (here or elsewhere) answers 404: say so instead of the generic error view.
  if (query.data === undefined && query.error instanceof ApiError && query.error.status === 404) {
    return (
      <div>
        <PageHeader title="Target not found" crumbs={[{ label: "Targets", href: "/targets" }, { label: slug }]} />
        <EmptyState icon={SearchX} title="There is no target with this name" hint="It may have been deleted. Add the repository again from the targets list." action={backLink} />
      </div>
    );
  }

  return (
    <DataView query={query} what="the target" skeleton={<TargetDetailSkeleton />}>
      {(t) => {
        const sandbox = t.kind === "sandbox";
        const added = isoAgo(t.cloned_at);
        const approved = isoAgo(t.approved_at);
        return (
          <div>
            <PageHeader title={t.name} subtitle={sandbox ? STATUS_HINT[t.status] : "The target that ships with Preflight. It runs from a local checkout with fixers enabled."}
              crumbs={[{ label: "Targets", href: "/targets" }, { label: t.slug }]}
              right={<>{t.url && <Button variant="outline" size="sm" nativeButton={false} render={<a href={t.url} target="_blank" rel="noreferrer" />}><ExternalLink />GitHub</Button>}{sandbox && t.status !== "needs_review" && t.status !== "error" && t.status !== "unsupported" && <DeleteTargetButton target={t} onDeleted={back} variant="outline" size="sm" label="Delete" />}</>}
              meta={<>
                <AnimatedStatus status={t.status} /><TrustBadge target={t} />
                {t.head_sha && <Truncate text={t.head_sha} className="mono text-xs text-muted-foreground"><GitCommit aria-hidden className="mr-1 inline size-3" />{shortId(t.head_sha, 7)}</Truncate>}
                {added && <Mono>cloned {added}</Mono>}{approved && t.status === "ready" && <Mono>approved {approved}</Mono>}
              </>} />
            <div className="space-y-6">
              {sandbox && <Card className={PANEL}><CardContent className="p-4 sm:p-6"><FlowStepper t={t} /></CardContent></Card>}
              {sandbox && <FadeRise key={t.status} delay={0.05}><StatePanel t={t} onDeleted={back} /></FadeRise>}
              {sandbox && t.status !== "cloning" && Object.keys(t.stack ?? {}).length > 0 && (
                <section>
                  <SectionHeader title="Detected stack" subtitle="read from the files of the clone; nothing was imported, installed or run" />
                  <StackPanel t={t} />
                </section>
              )}
              {!sandbox && (
                <Card className={PANEL}><CardContent className="space-y-3 p-4 sm:p-5">
                  <div className="flex min-w-0 items-center gap-2"><Mono className="shrink-0">path</Mono><Truncate text={t.path} className="mono text-xs text-foreground" /></div>
                  {t.manifest ? <Disclosure title="preflight.yaml" defaultOpen><pre tabIndex={0} className="mono scroll-thin max-h-[min(70vh,640px)] overflow-auto rounded-lg border border-border/60 bg-black/30 p-3 text-[11.5px] leading-5 text-muted-foreground">{t.manifest}</pre></Disclosure> : <Mono>preflight.yaml was not found at this path.</Mono>}
                </CardContent></Card>
              )}
              {sandbox && t.notes.length > 0 && (
                <Disclosure title={`History (${t.notes.length})`}>
                  <ol className="space-y-1">{t.notes.map((n, i) => <li key={i} className="mono text-xs break-words text-muted-foreground">{n}</li>)}</ol>
                </Disclosure>
              )}
            </div>
          </div>
        );
      }}
    </DataView>
  );
}
