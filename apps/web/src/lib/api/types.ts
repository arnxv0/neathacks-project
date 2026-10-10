// Mirrors preflight/models.py + web/index.py payloads.
export type Verdict = { grader: string; passed: boolean; evidence: string[]; violation_step: number | null };
export type Run = {
  run_id: string; assessment_id: string; attack_id: string; seed_id: string; target_commit: string; mode: string;
  neatlogs_trace_id: string | null; neatlogs_url: string | null; started_at: string; duration_ms: number; steps: number;
  tokens_in: number; tokens_out: number; usd: number; reply: string; verdicts: Record<string, Verdict>; failed: boolean;
  error: string | null; kind: "attack" | "replay" | "regression"; tool_names?: string[];
};
export type Step = {
  i: number; component: string; type: string; tool: string | null; args: Record<string, unknown> | null; result_kind: string | null;
  result_excerpt: string | null; tokens: number; usd: number; duration_ms: number | null; raw: Record<string, unknown>;
};
export type Divergence = { run_pass: string | null; run_fail: string; step_index: number; step_desc: string; trace_links: string[]; mode: "pass_vs_fail" | "vs_spec" };
export type Replay = { before: string; after: string; passed: number; total: number; run_ids: string[] };
export type FixAttempt = {
  cluster_id: string; n: number; author: "fixer" | "human"; review_comment: string | null; backend: string; branch: string; commit: string | null;
  entire_checkpoint_id: string | null; checkpoint_summary: string | null; replay: Replay | null; tests_green: boolean | null; cost_usd: number;
  status: string; fixer_session_id: string | null; summary: string; diff?: string; checkpoint_md?: string; brief?: string; replay_runs?: Run[];
};
export type Cluster = {
  cluster_id: string; signature: string; family: string; attack_ids: string[]; run_ids: string[]; failing_graders: string[];
  divergence: Divergence | null; hypothesis: string; suspected_paths: string[]; component: string; status: string;
  attempts: FixAttempt[]; attack_name?: string; owasp?: string | null;
};
export type ClusterDetail = Cluster & { divergence_md: string; graph_md?: string; fail_steps: Step[]; pass_steps: Step[]; attack: { id: string; name: string; owasp: string | null; safe_behavior: string; description: string } | null };
export type AttackScore = { attack_id: string; family: string; owasp: string | null; runs: number; succeeded: number; run_ids: string[]; failing_graders: Record<string, number> };
export type Scorecard = { total: number; succeeded: number; by_attack: Record<string, AttackScore>; by_family: Record<string, { runs: number; succeeded: number }>; by_owasp: Record<string, { runs: number; succeeded: number }> };
export type RegressionResult = { cluster_id: string; attack_id: string; fixed_by_commit: string | null; seeds: number; failed_runs: string[]; passed: boolean; target_commit: string; blame?: { files: string[]; commits: { sha: string; subject: string; author: string; date: string }[]; entire?: string } };
export type AttackInfo = { id: string; name: string; family: string; owasp: string | null; tier: string; safe_behavior: string; description: string };
export type Summary = {
  assessment_id: string; manifest: Record<string, any>; scorecard: Scorecard; after: Scorecard | null; clusters: Cluster[]; runs: Run[];
  regressions: RegressionResult[]; cost: { target_usd: number; preflight_llm_usd: number; fixer_usd: number; cap_usd: number | null; runs: number };
  attacks: Record<string, AttackInfo>;
};
export type AssessmentRow = { assessment_id: string; state: string; mode: string; label: string | null; kind: string; started_at: string | null; runs: number; succeeded: number; clusters: number; target_commit: string | null };
export type PreflightEvent = { seq: number; ts: number; type: string; [k: string]: any };
