"use client";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { API } from "@/lib/api/client";
import { keys } from "@/lib/api/hooks";
import type { PreflightEvent } from "@/lib/api/types";

const INVALIDATE: Record<string, "summary" | "cluster" | "both"> = {
  "state.changed": "summary", "run.graded": "summary", "run.finished": "summary", "cluster.created": "summary", "divergence.ready": "both",
  "fix.started": "both", "fix.attempt.done": "both", "replay.progress": "both", "replay.done": "both", "approval.needed": "both", merged: "both",
  rejected: "both", "regression.result": "summary", "cost.updated": "summary", stopped: "summary", "review.action": "both",
};

/** Tails the assessment's event log over SSE, keeps a rolling buffer, and invalidates queries so every screen updates live. */
export function useEventStream(assessmentId: string | null, max = 200) {
  const [events, setEvents] = useState<PreflightEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const qc = useQueryClient();
  const since = useRef(0);
  useEffect(() => {
    if (!assessmentId) return;
    let es: EventSource | null = null;
    let stopped = false;
    const open = () => {
      es = new EventSource(`${API}/api/assessments/${assessmentId}/events?since=${since.current}`);
      es.onopen = () => setConnected(true);
      es.onerror = () => { setConnected(false); es?.close(); if (!stopped) setTimeout(open, 1500); };
      es.onmessage = (m) => handle(m);
      // named events (event: <type>) don't fire onmessage; listen generically
      for (const t of Object.keys(INVALIDATE).concat(["run.started", "attack.planned", "recovery", "replay.started", "cluster.needs_human", "fix.error", "run.error"])) {
        es.addEventListener(t, (m) => handle(m as MessageEvent));
      }
    };
    const handle = (m: MessageEvent) => {
      try {
        const ev = JSON.parse(m.data) as PreflightEvent;
        if (ev.seq <= since.current) return;
        since.current = ev.seq;
        setEvents((prev) => [...prev.slice(-max + 1), ev]);
        const target = INVALIDATE[ev.type];
        if (target === "summary" || target === "both") qc.invalidateQueries({ queryKey: keys.summary(assessmentId) });
        if ((target === "cluster" || target === "both") && ev.cluster_id) qc.invalidateQueries({ queryKey: keys.cluster(assessmentId, ev.cluster_id) });
      } catch { /* ignore keepalives */ }
    };
    open();
    return () => { stopped = true; es?.close(); };
  }, [assessmentId, qc, max]);
  return { events, connected };
}
