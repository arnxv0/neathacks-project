"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, post } from "./client";
import type { AssessmentRow, ClusterDetail, RegressionResult, Run, Step, Summary } from "./types";

export const keys = {
  assessments: ["assessments"] as const,
  summary: (id: string) => ["summary", id] as const,
  cluster: (id: string, cid: string) => ["cluster", id, cid] as const,
  run: (id: string, rid: string) => ["run", id, rid] as const,
  regressions: ["regressions"] as const,
};

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
