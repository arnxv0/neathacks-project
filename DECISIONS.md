# Decisions log

- 2026-10-10 Dashboard is a Next.js app (`apps/web`) over a FastAPI REST+SSE API instead of the single HTML page in ARCHITECTURE §12. User requirement.
- 2026-10-10 Dropped `preflight.db`. The ledger directory is the only state; the web API indexes it with an mtime cache.
- 2026-10-10 Grading reads the target's local JSONL mirror (`GET /preflight/runs/{run_id}`). neatlogs supplies trace ids, deep links, token/cost numbers and the before/after comparison. Reason: neatlogs' public read API needs a service-account token and has ingest lag; grading must be deterministic and offline-safe.
- 2026-10-10 neatlogs read endpoint is `app.neatlogs.com/api/v1/public/traces?sessionId=<run_id>` (SPEC §13 guessed `/api/traces/v3/:id`). Runs are tagged with `session_id = run_id` to bridge the two.
- 2026-10-10 Crustdata: legacy `/screener` returns 403 for new accounts; the target uses `POST /company/enrich` (`x-api-version: 2025-11-01`, 2 credits/call).
- 2026-10-10 Target model defaults to `claude-haiku` via LiteLLM; Bedrock is one env switch away but blocked until the Anthropic use-case form is approved in the AWS account.
- 2026-10-10 Long-running services run in Docker Compose; Entire and the Claude Code fixers run on the host (Entire hooks into the target repo's git, `claude` uses the existing login).
- 2026-10-10 Susceptibility probe (D1/D2, 3 seeds): `claude-haiku` fell to 3/3 D1 seeds (credit, partner-email exfil, canary in link) and 0/2 D2; `nova-lite` 2/3 D1, 0/2 D2. Target stays on `claude-haiku`. Poisoned records were rewritten to read like synced ops/billing notes rather than overt commands, which is what real indirect injection looks like.
- 2026-10-10 neatlogs ingest (`ingest.neatlogs.com`, AWS ALB) is intercepted on this network by a safebrowse.io filter that answers port 443 with a plain-HTTP redirect, so spans can't be exported from this machine until the filter is disabled or we're on another network. Grading never depended on it (mirror), trace ids are still captured from the SDK, and the ledger records the export failure as a recovery event.
