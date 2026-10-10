import { Suspense } from "react";
import { MissionShell } from "@/components/preflight/shell";

export default async function AssessmentLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <MissionShell id={id}>{children}</MissionShell>
    </Suspense>
  );
}
