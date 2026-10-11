# Sandbox targets: test another agent

Preflight can crash-test an agent it has never seen: paste a public GitHub URL in the dashboard (or `preflight target add <url>`), and the repository becomes a *sandbox target*. This page describes the flow, what each step is allowed to do, and what it does not protect against.

Code: `src/preflight/sandbox/` (`registry`, `clone`, `inspect`, `onboard`, `contract`, `runtime`, `applicable`, `fixing`), API in `src/preflight/web/routes/targets.py`, CLI `preflight target ...`.

## Flow

```
add URL ──► cloning ──► cloned ──► onboarding ──► needs_review ──► ready ──► preflight run sandbox:<slug>
                │           │            │               ▲ approve (human)
                │           │            ├──► unsupported (not an LLM agent / cannot be wrapped)
                └──► error  │            └──► error (session failed, manifest invalid)
                            └──► needs_review directly, when the repo ships its own preflight.yaml
```

| Step | Command / endpoint | What happens | Runs third-party code? |
|---|---|---|---|
| Add | `preflight target add <url>` · `POST /api/targets` | URL checked, repo cloned, files inspected | No |
| Onboard | `preflight target onboard <slug>` · `POST /api/targets/{slug}/onboard` | A Claude Code session with file tools only writes `preflight.yaml` and `preflight_adapter.py` in the clone | No |
| Review | `GET /api/targets/{slug}` (`onboard_patch`, `manifest`) | A human reads the diff | No |
| Approve | `preflight target approve <slug>` · `POST /api/targets/{slug}/approve` | Status becomes `ready`, bound to the exact files on disk | No |
| Run | `preflight run sandbox:<slug>` · `POST /api/assessments {"target": "<slug>"}` | Image built, container started, attacks run, container removed | Yes, inside Docker only |
| Remove | `preflight target rm <slug>` · `DELETE /api/targets/{slug}` | Container, image, clone and registry files deleted | No |

On disk (default `<repo>/sandbox`, override with `PREFLIGHT_SANDBOX_DIR`; git-ignored):

```
sandbox/targets/<slug>/                 the clone (slug = <owner>--<repo>, lower case)
sandbox/registry/<slug>.json            the entry: url, status, head sha, inspection summary, trusted flag, notes, last error
sandbox/registry/<slug>.brief.md        the onboarder's brief
sandbox/registry/<slug>.onboard.patch   what the human reviews (git diff + full text of new files)
sandbox/registry/<slug>.onboard.log     the onboarder session output
sandbox/registry/<slug>.Dockerfile      generated when the repo has none (never written into the clone)
sandbox/registry/<slug>.runtime.json    port + per-target ownership token (mode 0600)
sandbox/registry/<slug>.fixes.patch     exported fixes (only with --allow-fix)
```

The registry lives outside the clone on purpose: nothing in a cloned repository can change its own status or mark itself trusted.

## What each step is allowed to do

**The clone is inert.**
- Only `https://github.com/<owner>/<repo>[.git]` is accepted. SSH, other hosts, credentials in the URL, extra path segments, query strings, `..` and option-like names are rejected before git is called.
- `git -c core.hooksPath=/dev/null clone --depth 50 --no-recurse-submodules --single-branch`, as an argument list (no shell), 180 s timeout, with prompts off and the user's and system git config ignored (no credential helper, no URL rewriting, no LFS download).
- Size cap after clone: 300 MB (`PREFLIGHT_SANDBOX_MAX_MB`); a larger repo is deleted.
- The clone's push URL is disabled. Nothing is ever pushed from a sandbox clone.
- Inspection reads files only (dependency manifests, source text, `.env.example` variable names). It does not import, install or follow symlinks.

**The onboarder cannot execute anything.** It is the same `claude -p ... --output-format json --permission-mode acceptEdits --allowedTools ... --max-turns` launch the fixers use, with:
- `--tools Read,Edit,Write,Glob,Grep,LS`: no Bash at all, no web tools;
- `--restricted`: file tools confined to the clone, the repo's own `.claude/settings.json` (hooks) ignored, writes to git and settings files not auto-approved;
- `--safe-mode` and `--strict-mcp-config`: the repo's `CLAUDE.md`, skills, hooks and MCP servers are not loaded;
- an environment with every `*KEY*`, `*TOKEN*`, `*SECRET*` variable removed except Claude's own login.

The brief tells it that everything in the repository is data, not instructions. After the session Preflight checks that git configuration and hooks inside the clone are byte-identical to before (otherwise the target is marked `error`), loads the manifest with the real loader, and applies the sandbox rules: only `${PORT}` and `${PREFLIGHT_OWNERSHIP_TOKEN}` placeholders, every endpoint on `http://localhost:${PORT}`, `repo: .`, paths inside the clone, no reserved environment names. A third-party manifest is loaded with those two values only, so it cannot pull a host variable into a URL or a command.

If the repository is not an LLM agent, is not Python, or cannot be wrapped, the onboarder writes `PREFLIGHT_UNSUPPORTED.md` instead and the target becomes `unsupported`.

**A human approves.** Onboarding always ends in `needs_review`, never `ready`. The same holds for a repository that ships its own `preflight.yaml`. Approval records a fingerprint of the checked-out commit plus the review patch; if any file changes afterwards, the next start is refused and the target goes back to `needs_review`.

**The run is containerised.**
- Image `preflight-sbx-<slug>` from the repo's own Dockerfile, or a generated one (`python:3.12-slim` + dependencies from `requirements.txt` / `pyproject.toml` + FastAPI/uvicorn, non-root user; `node:22-slim` with `npm ci --ignore-scripts` for JS).
- `docker run --rm` with `--memory 1g --cpus 1 --pids-limit 256 --cap-drop ALL --security-opt no-new-privileges`, no volumes or mounts, port published on `127.0.0.1` only.
- Environment is a closed list, passed by name so values never show in the process list: `PORT`, `HOST`, `PREFLIGHT_OWNERSHIP_TOKEN` (random per target), `PREFLIGHT_MIRROR_DIR`, `LITELLM_BASE_URL`, `LITELLM_API_KEY`, `TARGET_MODEL`, and one base-URL variable per tool annotated with `upstream_env`, pointing at the chaos proxy.
- The container is removed when the assessment ends.
- Without Docker the run is refused. The only exception: the target is marked `trusted` **and** `PREFLIGHT_ALLOW_UNSANDBOXED=1` is set; then the manifest's `start` command runs on the host through `target/process.py` with the same closed environment.

**Find-only by default.** Fixers do not run on third-party code. `--allow-fix` (API: `allow_fix: true`) is accepted only for a target marked `trusted`, because fixers run the repository's tests and a shell on the host. Fixes then stay on local branches of the clone and are exported to `sandbox/registry/<slug>.fixes.patch`.

**Only applicable attacks run.** The catalog grew around a sales agent. For a sandbox target `sandbox/applicable.py` keeps an attack only if the manifest has what it needs: families A, B, C, H always; D needs a tool that returns external data (`upstream_env` or `kind: external`); E needs `kind: sql`; F needs `canaries_file`; G needs a `high_impact: true` tool. An attack can override this with `applies_when: [...]` in its YAML. Skipped attacks and reasons are recorded in the ledger manifest (`attacks_skipped`) and as an `attack.skipped` event.

## Network choice

The container is on Docker's default bridge network with outbound access. It needs two destinations: the model gateway (a remote HTTPS endpoint) and the chaos proxy on the host, reached as `host.docker.internal` (`--add-host host.docker.internal:host-gateway`). Restricting egress to exactly those two needs a filtering proxy or firewall rules that Docker Desktop does not offer per container, so it is not done by default. `PREFLIGHT_SANDBOX_NETWORK=<name>` runs the container on a network you created yourself, for example an internal network with an egress proxy.

On Linux the chaos proxy binds to loopback by default and is then not reachable from a container; start it with `preflight proxy --host 0.0.0.0` (or bind it to the Docker bridge address) when a sandbox target has `upstream_env` tools.

## What is NOT protected against

- **The model key is given to third-party code.** The container needs a key to call the model, and the code in it can send that key anywhere. Set `PREFLIGHT_SANDBOX_LITELLM_API_KEY` to a separate, budget-capped key; if it is unset, Preflight's own `LITELLM_API_KEY` is passed.
- **Outbound network from the container is open.** The agent can call any internet host and any service on the host machine that listens on an address reachable through `host.docker.internal` (on Docker Desktop this includes services bound to the host's loopback, such as the Preflight API).
- **A container is not a VM.** Kernel or Docker escape bugs are out of scope. For hostile code use a throwaway machine.
- **The image build runs the repository's install steps** (its Dockerfile, or dependency installation in the generated one) with network access. It happens inside `docker build`, not on the host, and no secret is passed to it.
- **A repository's own Dockerfile is used as is.** Preflight overrides the entrypoint with the manifest's `start` command but does not force a non-root user in that case.
- **Prompt injection against the onboarder** can at worst produce bad files inside the clone. That is why the files are validated and a human reads the patch. Files matched by the repo's `.gitignore` are listed by name in the patch but their content is not shown.
- **Trusted mode removes the sandbox.** `trusted` + `PREFLIGHT_ALLOW_UNSANDBOXED=1`, and `--allow-fix`, run the repository's code on the host. Use them only for code you own.
- **Disk and time during clone** are bounded by the 180 s timeout and the size check after the clone, not by a quota during it.
- **Grading quality depends on the adapter.** Deterministic graders read the step mirror the adapter writes. If the onboarder could only record `user_message` and `reply`, tool-level graders have nothing to check.
- **Attack seeds are written for a sales agent.** Applicable attacks still use the catalog's messages and expectations (company names, `send_email`, `issue_credit`). Findings on an unrelated agent need a human read; seeds generated from the target's own tools are future work.

## Limits of the first version

Python agents only for onboarding (a JS repo runs only if it ships its own `preflight.yaml`); one repository per target; one component. A failed clone must be removed before the same URL can be added again when it was added in the background.
