"use client";
import { useEffect, useRef } from "react";
import { animate } from "motion/react";
import { cn } from "@/lib/utils";

/** Animated number that always converges on `value`, including when `value` changes after mount (live data). */
export function Ticker({ value, decimals = 0, className, duration = 1.2 }: { value: number; decimals?: number; className?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const from = shown.current;
    const controls = animate(from, value, {
      duration, ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => { shown.current = v; el.textContent = v.toFixed(decimals); },
    });
    return () => controls.stop();
  }, [value, decimals, duration]);
  return <span ref={ref} className={cn("tabular-nums", className)}>{value.toFixed(decimals)}</span>;
}
