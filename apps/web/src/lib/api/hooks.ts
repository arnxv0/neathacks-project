"use client";
import { useSyncExternalStore } from "react";
import { useMutation, useQuery as useBaseQuery, useQueryClient, type QueryKey, type UseQueryResult } from "@tanstack/react-query";
import { api, del, post } from "./client";
import type { AssessmentRow, ClusterDetail, RegressionResult, Run, StartBody, Step, Summary, Target, TargetDetail, TargetsList } from "./types";

export const keys = {
  assessments: ["assessments"] as const,
  summary: (id: string) => ["summary", id] as const,
  cluster: (id: string, cid: string) => ["cluster", id, cid] as const,
  run: (id: string, rid: string) => ["run", id, rid] as const,
  regressions: ["regressions"] as const,
  targets: ["targets"] as const,
  target: (slug: string) => ["target", slug] as const,
};

const noop = () => () => {};
/** false on the server and while a boundary is hydrating, true afterwards. */
const useHydrated = () => useSyncExternalStore(noop, () => true, () => false);

/** useQuery that is guaranteed to render "no data yet" during hydration. The shell and the page share cache keys but hydrate at
 *  different times (Suspense boundaries), so a fast response could otherwise reach a boundary before it hydrated and cause a mismatch.
 *  `refetchInterval` may be a function of the latest data (poll fast while a background job runs, slowly otherwise). */
function useQuery<T>(opts: { queryKey: QueryKey; queryFn: () => Promise<T>; refetchInterval?: number | ((data: T | undefined) => number | false); enabled?: boolean }): UseQueryResult<T> {
  const hydrated = useHydrated();
  const { refetchInterval: every, enabled = true, ...rest } = opts;
  const q = useBaseQuery({ ...rest, refetchInterval: typeof every === "function" ? (query) => every(query.state.data as T | undefined) : every, enabled: hydrated && enabled });
  return hydrated ? q : ({ ...q, data: undefined, error: null } as UseQueryResult<T>);
}

export const useAssessments = () => useQuery({ queryKey: keys.assessments, queryFn: () => api<AssessmentRow[]>("/api/assessments"), refetchInterval: 5000 });
export const useSummary = (id: string, enabled = true) => useQuery({ queryKey: keys.summary(id), queryFn: () => api<Summary>(`/api/assessments/${id}`), refetchInterval: 4000, enabled });
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
/** `target` is "builtin" or a sandbox slug; a sandbox target runs find-only unless `allow_fix` is set and the target is trusted. */
export function useStart() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body: StartBody) => post<{ assessment_id: string | null; pid: number }>("/api/assessments", body), onSuccess: () => qc.invalidateQueries({ queryKey: keys.assessments }) });
}
export const useStop = () => useMutation({ mutationFn: () => post("/api/stop") });
export type DemoReset = { ok: boolean; target_commit: string; fix_branches_removed: number; assessments_archived: number; regression_suites_archived: number; archive: string | null; target_process: string };
export const useDemoInfo = () => useQuery({ queryKey: ["demo"], queryFn: () => api<{ reset_available: boolean; unfixed_tag: string }>("/api/demo") });
/** Fresh instance: target back on its unfixed tag, ledger and regression suite archived. Every cached query is dropped. */
export function useDemoReset() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => post<DemoReset>("/api/demo/reset"), onSuccess: () => qc.clear() });
}

/* Targets. A target that is cloning or onboarding is worked on by a background job in the API, so both queries poll fast until it settles. */
const BUSY = new Set(["cloning", "onboarding"]);
export const useTargets = () => useQuery({ queryKey: keys.targets, queryFn: () => api<TargetsList>("/api/targets"), refetchInterval: (d) => (d?.targets.some((t) => BUSY.has(t.status)) ? 1500 : 6000) });
export const useTarget = (slug: string) => useQuery({ queryKey: keys.target(slug), queryFn: () => api<TargetDetail>(`/api/targets/${encodeURIComponent(slug)}`), refetchInterval: (d) => (d && BUSY.has(d.status) ? 1500 : 5000) });

/** Puts the entry an action returned into both caches at once (the card and the detail page change without waiting for the next poll), then refetches. */
function useTargetCache() {
  const qc = useQueryClient();
  return {
    put: (t: Target) => {
      qc.setQueryData<TargetsList>(keys.targets, (old) => old && { ...old, targets: old.targets.some((x) => x.slug === t.slug) ? old.targets.map((x) => (x.slug === t.slug ? { ...x, ...t } : x)) : [...old.targets, t] });
      qc.setQueryData<TargetDetail>(keys.target(t.slug), (old) => old && { ...old, ...t });
      qc.invalidateQueries({ queryKey: keys.targets });
      qc.invalidateQueries({ queryKey: keys.target(t.slug) });
    },
    drop: (slug: string) => {
      qc.setQueryData<TargetsList>(keys.targets, (old) => old && { ...old, targets: old.targets.filter((x) => x.slug !== slug) });
      qc.removeQueries({ queryKey: keys.target(slug) });
      qc.invalidateQueries({ queryKey: keys.targets });
    },
  };
}
export function useAddTarget() {
  const cache = useTargetCache();
  return useMutation({ mutationFn: (url: string) => post<Target>("/api/targets", { url }), onSuccess: cache.put });
}
export function useTargetActions(slug: string) {
  const cache = useTargetCache();
  const base = `/api/targets/${encodeURIComponent(slug)}`;
  return {
    onboard: useMutation({ mutationFn: () => post<Target>(`${base}/onboard`), onSuccess: cache.put }),
    approve: useMutation({ mutationFn: () => post<Target>(`${base}/approve`), onSuccess: cache.put }),
    trust: useMutation({ mutationFn: (trusted: boolean) => post<Target>(`${base}/trust`, { trusted }), onSuccess: cache.put }),
    remove: useMutation({ mutationFn: () => del<{ ok: boolean; slug: string }>(base), onSuccess: () => cache.drop(slug) }),
  };
}
