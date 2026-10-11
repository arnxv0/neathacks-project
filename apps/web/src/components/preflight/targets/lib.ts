import { ApiError } from "@/lib/api/client";
import type { Target, TargetStatus } from "@/lib/api/types";
import { timeAgo } from "@/lib/format";

/** Same rule as sandbox/registry.py `parse_url`: exactly https://github.com/<owner>/<repo>[.git]. */
const REPO_URL = /^https:\/\/github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?)\/([A-Za-z0-9._-]{1,100})$/;
const PREFIX = "https://github.com/";
export const URL_EXAMPLE = "https://github.com/owner/repo";

/** What is sent to the API: trimmed, without a trailing slash. */
export const normalizeRepoUrl = (raw: string) => raw.trim().replace(/\/+$/, "");

/** A plain-words reason the address cannot be used, or null when it is valid (or still being typed). */
export function validateRepoUrl(raw: string, { final = false }: { final?: boolean } = {}): string | null {
  const v = normalizeRepoUrl(raw);
  if (!v) return final ? "Enter a repository address." : null;
  if (!final && PREFIX.startsWith(v)) return null; // still typing the fixed part
  if (/^(git@|ssh:\/\/)/i.test(v)) return "Use the https:// address of the repository, not the SSH one.";
  if (/^http:\/\//i.test(v)) return "Use https://, not http://.";
  if (!/^https:\/\//i.test(v)) return `Start with ${PREFIX} (for example ${URL_EXAMPLE}).`;
  if (/^https:\/\/[^/]*@/.test(v)) return "Remove the user name or token from the address. Only public repositories are accepted.";
  if (!v.startsWith(PREFIX)) return "Only repositories on github.com are accepted.";
  const rest = v.slice(PREFIX.length);
  if (/[?#]/.test(rest)) return "Remove everything after the repository name (no ? or #).";
  const parts = rest.split("/");
  if (parts.length < 2 || !parts[1]) return final ? `Add the repository name: ${URL_EXAMPLE}.` : null;
  if (parts.length > 2) return `Use the repository address only, without a branch or file path: ${PREFIX}${parts[0]}/${parts[1]}`;
  const m = REPO_URL.exec(v);
  const repo = m?.[2].replace(/\.git$/, "") ?? "";
  if (!m || !repo || repo.includes("..") || /^[-.]/.test(repo) || m[1].includes("--")) return "That is not a valid GitHub owner or repository name.";
  return null;
}

/** API error codes (web/routes/targets.py STATUS_OF) in plain words. Codes not listed fall back to the message the API sent. */
const CODE_TEXT: Record<string, string> = {
  invalid_url: `That address is not accepted. Use a public repository as ${URL_EXAMPLE}.`,
  too_large: "The repository is larger than the sandbox size limit, so it was not kept.",
  clone_failed: "The repository could not be cloned. Check that it exists and is public.",
  already_exists: "This repository is already a target. Open it from the list, or delete it before adding it again.",
  docker_unavailable: "Docker is not available, and third-party code is never started outside a container. Start Docker and try again.",
  not_approved: "This target has not been approved, or its files changed after approval. Review and approve it first.",
  fix_requires_trust: "Fixers only run on a target you marked as trusted.",
  onboarder_unavailable: "The onboarder (Claude Code) is not available on this machine.",
  not_found: "This target no longer exists.",
};
export const codeText = (code: string | null | undefined) => (code ? CODE_TEXT[code] : undefined);

/** One plain sentence for a failed request. */
export function errorText(e: unknown): string {
  if (e instanceof ApiError) return codeText(e.code) ?? e.detail ?? e.message;
  if (e instanceof TypeError) return "The Preflight API is not reachable.";
  return e instanceof Error ? e.message : String(e);
}

/** "3m ago" for an ISO timestamp from the registry. */
export function isoAgo(iso: string | null | undefined): string | null {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? null : timeAgo(t / 1000);
}

export const isBusy = (s: TargetStatus) => s === "cloning" || s === "onboarding";

export type StepState = "done" | "active" | "busy" | "failed" | "skipped" | "todo";
export const FLOW = [
  { id: "cloned", label: "Cloned", hint: "files inspected, nothing run" },
  { id: "onboarded", label: "Onboarded", hint: "adapter written in the clone" },
  { id: "reviewed", label: "Reviewed", hint: "you read the generated files" },
  { id: "ready", label: "Ready", hint: "approved for these exact files" },
  { id: "run", label: "Run", hint: "attacked inside a container" },
] as const;

/** The state of each of the five flow steps for a target. */
export function flowStates(t: Pick<Target, "status" | "contract_native" | "cloned_at">): StepState[] {
  const onboarded: StepState = t.contract_native ? "skipped" : "done";
  switch (t.status) {
    case "cloning": return ["busy", "todo", "todo", "todo", "todo"];
    case "cloned": return t.contract_native ? ["done", "skipped", "active", "todo", "todo"] : ["done", "active", "todo", "todo", "todo"];
    case "onboarding": return ["done", "busy", "todo", "todo", "todo"];
    case "needs_review": return ["done", onboarded, "active", "todo", "todo"];
    case "ready": return ["done", onboarded, "done", "done", "active"];
    case "unsupported": return ["done", "failed", "todo", "todo", "todo"];
    case "error": return t.cloned_at ? ["done", "failed", "todo", "todo", "todo"] : ["failed", "todo", "todo", "todo", "todo"];
    default: return ["todo", "todo", "todo", "todo", "todo"];
  }
}

/** One line under the status: what the target is waiting for. */
export const STATUS_HINT: Record<TargetStatus, string> = {
  cloning: "Cloning and inspecting the repository…",
  cloned: "Cloned and inspected. Next: generate the adapter.",
  onboarding: "A confined Claude Code session is writing the adapter…",
  needs_review: "The adapter is written. Read it and approve it.",
  ready: "Approved. Ready to be attacked.",
  unsupported: "This repository cannot be tested as an agent.",
  error: "Something went wrong.",
};
