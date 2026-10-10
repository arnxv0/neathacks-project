"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAssessments } from "@/lib/api/hooks";
import { Landing } from "@/components/preflight/shell";

export default function Home() {
  const router = useRouter();
  const { data } = useAssessments();
  const latest = data?.find((a) => a.kind !== "regress" && !a.assessment_id.startsWith("regress-"));
  useEffect(() => { if (latest) router.replace(`/a/${latest.assessment_id}`); }, [latest, router]);
  return <Landing hasData={!!data} />;
}
