"use client";
import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";

const EVENT = "preflight:navigate";
/** Call before a programmatic router.push so the bar also shows for navigations that are not link clicks. */
export const startRouteProgress = () => window.dispatchEvent(new Event(EVENT));

/** Thin progress bar under the top edge while a route change is pending. It starts on an in-app link click
 *  and ends when the URL has changed: "pending" is simply "the URL is still the one we left from". */
export function RouteProgress() {
  const here = `${usePathname()}?${useSearchParams()}`;
  const [from, setFrom] = useState<string | null>(null);
  const pending = from !== null && from === here;

  useEffect(() => {
    const current = () => `${location.pathname}?${new URLSearchParams(location.search)}`;
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.origin !== location.origin || a.hasAttribute("download")) return;
      if (a.pathname === location.pathname && a.search === location.search) return;
      setFrom(current());
    };
    const onStart = () => setFrom(current());
    document.addEventListener("click", onClick);
    window.addEventListener(EVENT, onStart);
    return () => { document.removeEventListener("click", onClick); window.removeEventListener(EVENT, onStart); };
  }, []);

  // Safety net: never leave the bar up if a navigation was cancelled.
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setFrom(null), 8000);
    return () => clearTimeout(t);
  }, [pending]);

  return (
    <AnimatePresence>
      {pending && (
        <motion.div key="bar" role="progressbar" aria-label="Loading page" aria-busy="true" className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 origin-left bg-primary shadow-[0_0_8px_var(--primary)]"
          initial={{ scaleX: 0, opacity: 1 }} animate={{ scaleX: 0.85, transition: { duration: 2.5, ease: [0.1, 0.7, 0.2, 1] } }} exit={{ scaleX: 1, opacity: 0, transition: { duration: 0.2, ease: "easeOut" } }} />
      )}
    </AnimatePresence>
  );
}
