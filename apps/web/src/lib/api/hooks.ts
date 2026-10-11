"use client";
import { useSyncExternalStore } from "react";
import { useMutation, useQuery as useBaseQuery, useQueryClient, type QueryKey, type UseQueryResult } from "@tanstack/react-query";
import { api, post } from "./client";
import type { AssessmentRow, ClusterDetail, RegressionResult, Run, Step, Summary } from "./types";

export const keys = {
  assessments: ["assessments"] as const,
  summary: (id: string) => ["summary", id] as const,
  cluster: (id: string, cid: string) => ["cluster", id, cid] as const,
  run: (id: string, rid: string) => ["run", id, rid] as const,
  regressions: ["regressions"] as const,
};

const noop = () => () => {};
/** false on the server and while a boundary is hydrating, true afterwards. */
const useHydrated = () => useSyncExternalStore(noop, () => true, () => false);

/** useQuery that is guaranteed to render "no data yet" during hydration. The shell and the page share cache keys but hydrate at
 *  different times (Suspense boundaries), so a fast response could otherwise reach a boundary before it hydrated and cause a mismatch. */
function useQuery<T>(opts: { queryKey: QueryKey; queryFn: () => Promise<T>; refetchInterval?: number }): UseQueryResult<T> {
  const hydrated = useHydrated();
  const q = useBaseQuery({ ...opts, enabled: hydrated });
  return hydrated ? q : ({ ...q, data: undefined, error: null } as UseQueryResult<T>);
}

export const useAssessments = () => useQuery({ queryKey: keys.assessments, queryFn: () => api<AssessmentRow[]>("/api/assessments"), refetchInterval: 5000 });
export const useSummary = (id: string) => useQuery({ queryKey: keys.summary(id), queryFn: () => api<Summary>(`/api/assessments/${id}`), refetchInterval: 4000 });
export const useCluster = (id: string, cid: string) => useQuery({ queryKey: keys.cluster(id, cid), queryFn: () => api<ClusterDetail>(`/api/assessments/${id}/clusters/${cid}`), refetchInterval: 4000 });
export const useRun = (id: string, rid: string) => useQuery({ queryKey: keys.run(id, rid), queryFn: () => api<{ run: Run; steps: Step[]; transcript: string }>(`/api/assessments/${id}/runs/${rid}`) });
export const useRegressions = () => useQuery({ queryKey: keys.regressions, queryFn: () => api<RegressionResult[]>("/api/regressions") });

export function useReview(id: string, cid: string) {
  const qc = useQueryClient();
  const inv = () => { qc.invalidateQueries({ queryKey: keys.cluster(id, cid) }); qc.invalidateQueries({ queryKey: keys.summary(id) }); };
  return {
    approve: useMutation({ mutationFn: () => post(`/api/assessments/${id}/clusters/${cid}/approve`), onSuccess: inv }),
    reject: useMutation({ mutationFn: (comment: string) => post(`/api/assessments/${id}/clusters/${cid}/reject`, { comment }), onSuccess: inv }),
    requestChanges: useMutation({ mutationFn: (comment: string) => post(`/api/assessments/${id}/clusters/${cid}/request-changes`, { comment }), onSuccess: inv }),
    edit: useMutation({ mutationFn: (files: Record<string, string>) => post(`/api/assessments/${id}/clusters/${cid}/edit`, { files }), onSuccess: inv }),
  };
}
export const useStart = () => useMutation({ mutationFn: (body: { mode: string; attacks?: string; seeds?: number; no_fix?: boolean }) => post<{ assessment_id: string }>("/api/assessments", body) });
export const useStop = () => useMutation({ mutationFn: () => post("/api/stop") });
