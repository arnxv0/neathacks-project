"use client";
import { GitFork } from "lucide-react";
import { useTargets } from "@/lib/api/hooks";
import { AddTargetDialog, BuiltinCard, DockerWarning, TargetCard, useTargetTransitions } from "@/components/preflight/targets";
import { DataView, EmptyState, Mono, PageHeader, Stagger, StaggerItem, Truncate } from "@/components/preflight/shared";
import { TargetsSkeleton } from "@/components/preflight/shared/skeletons";

export default function Targets() {
  const query = useTargets();
  useTargetTransitions(query.data?.targets);
  return (
    <DataView query={query} what="the targets" skeleton={<TargetsSkeleton />}>
      {(data) => {
        const builtin = data.targets.filter((t) => t.kind === "builtin");
        const sandbox = data.targets.filter((t) => t.kind === "sandbox");
        return (
          <div>
            <PageHeader title="Targets" subtitle="The agents Preflight can attack: the built-in one, and any public GitHub repository you add."
              right={<AddTargetDialog />}
              meta={<><Mono className="shrink-0">sandbox folder</Mono><Truncate text={data.sandbox_root} className="mono text-xs text-foreground" /></>} />
            {!data.docker_available && sandbox.length > 0 && <DockerWarning className="mb-5" />}
            <Stagger className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {builtin.map((t) => <StaggerItem key={t.slug}><BuiltinCard t={t} /></StaggerItem>)}
              {sandbox.map((t) => <StaggerItem key={t.slug}><TargetCard t={t} dockerAvailable={data.docker_available} /></StaggerItem>)}
            </Stagger>
            {sandbox.length === 0 && (
              <div className="mt-4">
                <EmptyState icon={GitFork} title="No repositories added yet"
                  hint="Add a public GitHub repository and Preflight clones it into a sandbox, writes an adapter for you to review, and attacks it in an isolated container."
                  action={<AddTargetDialog variant="outline" size="sm" />} />
              </div>
            )}
          </div>
        );
      }}
    </DataView>
  );
}
