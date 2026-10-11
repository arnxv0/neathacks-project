"use client";
import { Suspense, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RouteProgress } from "@/components/preflight/shell/RouteProgress";

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 2000, retry: 1 } } }));
  return (
    <QueryClientProvider client={qc}>
      {/* reducedMotion="user": with prefers-reduced-motion, transforms and layout animations are skipped, opacity still fades */}
      <MotionConfig reducedMotion="user">
        <Suspense fallback={null}><RouteProgress /></Suspense>
        <TooltipProvider delay={250}>{children}</TooltipProvider>
      </MotionConfig>
      <Toaster richColors position="bottom-right" offset={{ bottom: 52 }} />
    </QueryClientProvider>
  );
}
