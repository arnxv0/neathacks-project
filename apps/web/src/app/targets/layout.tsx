import { Suspense } from "react";
import { MissionShell } from "@/components/preflight/shell";
import { ShellSkeleton, TargetsSkeleton } from "@/components/preflight/shared/skeletons";

/** Targets live outside an assessment, inside the same shell (sidebar and top bar) without an assessment id. */
export default function TargetsLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<ShellSkeleton><TargetsSkeleton /></ShellSkeleton>}>
      <MissionShell>{children}</MissionShell>
    </Suspense>
  );
}
