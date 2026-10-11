"use client";
import { useEffect, useRef } from "react";
import { animate, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/** Animated number that always converges on `value`, including when `value` changes after mount (live data).
 *  With prefers-reduced-motion the number is set immediately. */
export function Ticker({ value, decimals = 0, className, duration = 0.9 }: { value: number; decimals?: number; className?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce) { shown.current = value; el.textContent = value.toFixed(decimals); return; }
    const from = shown.current;
    const controls = animate(from, value, {
      duration, ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => { shown.current = v; el.textContent = v.toFixed(decimals); },
    });
    return () => controls.stop();
  }, [value, decimals, duration, reduce]);
  return <span ref={ref} className={cn("tabular-nums", className)}>{value.toFixed(decimals)}</span>;
}
