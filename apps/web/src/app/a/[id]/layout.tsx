import { Suspense } from "react";
import { MissionShell } from "@/components/preflight/shell";
import { ShellSkeleton } from "@/components/preflight/shared/skeletons";

export default async function AssessmentLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <MissionShell id={id}>{children}</MissionShell>
    </Suspense>
  );
}
