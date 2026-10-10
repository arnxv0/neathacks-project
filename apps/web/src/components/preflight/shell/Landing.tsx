"use client";
import { BackgroundBeams } from "@/components/ui/background-beams";
import { TextGenerateEffect } from "@/components/ui/text-generate-effect";
import { Button } from "@/components/ui/button";
import { useStart } from "@/lib/api/hooks";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function Landing({ hasData }: { hasData: boolean }) {
  const start = useStart();
  const router = useRouter();
  return (
    <main className="relative flex-1 flex flex-col items-center justify-center overflow-hidden px-4 min-h-screen">
      <BackgroundBeams className="opacity-60" />
      <div className="relative z-10 max-w-2xl text-center space-y-6">
        <p className="mono text-xs uppercase tracking-[0.3em] text-primary">preflight</p>
        <TextGenerateEffect words="Your agent passed the happy path. Now meet the users who didn't read it." className="text-3xl md:text-5xl font-semibold tracking-tight" />
        <p className="text-muted-foreground">Preflight attacks an AI agent with hostile users, broken tools and injected data, finds the first step where it goes wrong, fixes the code, and proves the fix holds.</p>
        <div className="flex items-center justify-center gap-3">
          <Button size="lg" onClick={() => start.mutate({ mode: "dev", attacks: "D1" }, { onSuccess: (r) => { toast.success(`Assessment ${r.assessment_id} started`); router.push(`/a/${r.assessment_id}`); }, onError: (e) => toast.error(String(e)) })} disabled={start.isPending}>
            {start.isPending ? "Launching…" : "Run an assessment"}
          </Button>
          {hasData && <Button size="lg" variant="outline" onClick={() => router.push("/a/latest")}>Open latest</Button>}
        </div>
        <p className="mono text-xs text-muted-foreground">API {process.env.NEXT_PUBLIC_API_URL}</p>
      </div>
    </main>
  );
}
