export const money = (n: number | null | undefined, digits = 2) => n == null ? "—" : `$${n.toFixed(digits)}`;
export const ms = (n: number | null | undefined) => n == null ? "—" : n < 1000 ? `${n} ms` : `${(n / 1000).toFixed(1)} s`;
export const shortId = (s: string | null | undefined, n = 8) => (s ?? "—").slice(0, n);
export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
export const timeAgo = (ts: number) => { const d = Date.now() / 1000 - ts; return d < 60 ? `${Math.max(0, Math.round(d))}s ago` : d < 3600 ? `${Math.round(d / 60)}m ago` : `${Math.round(d / 3600)}h ago`; };
export const FAMILIES: Record<string, string> = { A: "Hard personas", B: "Tool faults", C: "Jailbreaks", D: "Indirect injection", E: "Downstream injection", F: "Data exposure", G: "Excessive agency", H: "Denial of wallet", I: "Multi-agent" };
export const STATE_LABEL: Record<string, string> = { INIT: "Starting", BOOT_TARGET: "Booting target", VERIFY_OWNERSHIP: "Verifying ownership", ATTACK: "Attacking", GRADE: "Grading", CLUSTER: "Clustering", DIVERGE: "Finding divergence", FIX: "Fixing", AWAIT_APPROVAL: "Awaiting approval", REGRESSION_SUITE: "Regression suite", VERIFY_AFTER: "Verifying after", REPORT: "Reporting", DONE: "Done", STOPPED: "Stopped" };
