"use client";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

/** One easing and one duration range for the whole dashboard: fast, ease-out, no bounce.
 *  Reduced motion is handled globally by <MotionConfig reducedMotion="user"> in app/providers.tsx. */
export const EASE = [0.16, 1, 0.3, 1] as const;
export const DUR = 0.22;

/** Fade-and-rise on mount. Used for page and tab content. */
export function FadeRise({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: DUR, ease: EASE, delay }}>
      {children}
    </motion.div>
  );
}

const container = { hidden: {}, show: { transition: { staggerChildren: 0.03 } } };
const item = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: DUR, ease: EASE } } };

/** Grid or list whose children enter one after another. */
export function Stagger({ children, className, as = "div" }: { children: React.ReactNode; className?: string; as?: "div" | "ol" | "ul" }) {
  const C = as === "ol" ? motion.ol : as === "ul" ? motion.ul : motion.div;
  return <C className={className} variants={container} initial="hidden" animate="show">{children}</C>;
}

/** Child of <Stagger>. `layout` animates position when the list reorders or a neighbour changes size. */
export function StaggerItem({ children, className, as = "div" }: { children: React.ReactNode; className?: string; as?: "div" | "li" }) {
  const C = as === "li" ? motion.li : motion.div;
  return <C layout="position" className={cn("min-w-0", className)} variants={item} transition={{ layout: { duration: 0.25, ease: EASE } }}>{children}</C>;
}
