// Mirrors preflight/models.py + web/index.py payloads.
export type Verdict = { grader: string; passed: boolean; evidence: string[]; violation_step: number | null };
export type Run = { delivered?: boolean;
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
/** `undelivered`: replay runs in which the attack never reached the agent (the proxy was unreachable); they prove nothing. */
export type Replay = { before: string; after: string; passed: number; total: number; run_ids: string[]; undelivered?: number };
export type FixAttempt = {
  cluster_id: string; n: number; author: "fixer" | "human"; review_comment: string | null; backend: string; branch: string; commit: string | null;
  entire_checkpoint_id: string | null; checkpoint_summary: string | null; replay: Replay | null; tests_green: boolean | null; cost_usd: number;
  status: string; fixer_session_id: string | null; summary: string; merged?: boolean | null; merge_commit?: string | null; diff?: string; checkpoint_md?: string; brief?: string; replay_runs?: Run[];
};
export type Cluster = {
  cluster_id: string; signature: string; family: string; attack_ids: string[]; run_ids: string[]; failing_graders: string[];
  divergence: Divergence | null; hypothesis: string; suspected_paths: string[]; component: string; status: string;
  attempts: FixAttempt[]; attack_name?: string; owasp?: string | null;
  /** How a closed cluster was closed: its own commit merged, or main already passed after its branch conflicted (not merged). */
  resolution?: "merged" | "closed_by_main" | null;
};
export type ClusterDetail = Cluster & { divergence_md: string; graph_md?: string; fail_steps: Step[]; pass_steps: Step[]; attack: { id: string; name: string; owasp: string | null; safe_behavior: string; description: string } | null };
export type AttackScore = { attack_id: string; family: string; owasp: string | null; runs: number; succeeded: number; undelivered?: number; run_ids: string[]; failing_graders: Record<string, number> };
export type Scorecard = { total: number; succeeded: number; undelivered?: number; undelivered_run_ids?: string[]; by_attack: Record<string, AttackScore>; by_family: Record<string, { runs: number; succeeded: number }>; by_owasp: Record<string, { runs: number; succeeded: number }> };
export type RegressionResult = { cluster_id: string; attack_id: string; fixed_by_commit: string | null; seeds: number; failed_runs: string[]; undelivered_runs?: string[]; passed: boolean; target_commit: string; blame?: { files: string[]; commits: { sha: string; subject: string; author: string; date: string }[]; entire?: string } };
export type AttackInfo = { id: string; name: string; family: string; owasp: string | null; tier: string; safe_behavior: string; description: string };
export type Summary = {
  assessment_id: string; manifest: Record<string, any>; scorecard: Scorecard; after: Scorecard | null; clusters: Cluster[]; runs: Run[];
  regressions: RegressionResult[]; cost: { target_usd: number; preflight_llm_usd: number; fixer_usd: number; cap_usd: number | null; runs: number; inputs?: { variable: string; value: number; unit: string; source: string }[] };
  attacks: Record<string, AttackInfo>;
};
export type AssessmentRow = { assessment_id: string; state: string; mode: string; label: string | null; kind: string; started_at: string | null; runs: number; succeeded: number; clusters: number; target_commit: string | null };
export type PreflightEvent = { seq: number; ts: number; type: string; [k: string]: any };

// Targets: the built-in target plus sandbox targets (public GitHub repos). Mirrors web/routes/targets.py + sandbox/registry.py + sandbox/inspect.py.
export type TargetStatus = "cloning" | "cloned" | "onboarding" | "needs_review" | "ready" | "unsupported" | "error";
export type EntryPoint = { path: string; kind: string; detail?: string | null };
/** Static inspection summary. Empty object for the built-in target and while a sandbox target is still cloning. */
export type TargetStack = {
  languages?: string[]; package_manager?: string | null; dependency_count?: number; frameworks?: string[]; servers?: string[];
  entry_points?: EntryPoint[]; contract_native?: boolean; has_adapter?: boolean; dockerfile?: string | null; env_vars?: string[];
  has_tests?: boolean; file_count?: number; is_agent_candidate?: boolean; notes?: string[];
};
export type Target = {
  slug: string; kind: "sandbox" | "builtin"; name: string; url: string | null; path: string; status: TargetStatus;
  find_only: boolean; trusted: boolean; contract_native: boolean; stack: TargetStack; notes: string[];
  last_error: string | null; error_code: string | null;
  /** built-in only: its preflight.yaml was found on disk */
  available?: boolean;
  /** sandbox only */
  busy?: boolean; owner?: string; repo?: string; cloned_at?: string | null; head_sha?: string | null; approved_at?: string | null;
  manifest_path?: string | null; fix_base_sha?: string | null; updated_at?: string | null;
};
export type TargetRuntime = { running: boolean; mode: string | null; port: number | null; container: string | null; docker_available: boolean };
export type TargetDetail = Target & {
  manifest: string | null; onboard_patch: string | null; brief: string | null; fixes_patch?: string | null;
  onboard_log_tail?: string | null; runtime: TargetRuntime | null;
};
export type TargetsList = { targets: Target[]; docker_available: boolean; sandbox_root: string };
/** `manifest.sandbox` of an assessment that ran against a sandbox target. */
export type SandboxMeta = { slug: string; url: string; mode: string; container: string | null };
export type SkippedAttack = { attack_id: string; reason: string };
export type StartBody = { mode: string; attacks?: string; seeds?: number; no_fix?: boolean; target?: string; allow_fix?: boolean };
