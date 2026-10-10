import { MissionShell } from "@/components/preflight/shell";

export default async function AssessmentLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MissionShell id={id}>{children}</MissionShell>;
}
