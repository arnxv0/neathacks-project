# Preflight on AWS — one host for the judging window

One Graviton EC2 instance (Ubuntu 24.04 arm64) in your own account runs everything Preflight assumes lives on one
machine: the AcmeSales Copilot target (:8100), the chaos proxy (:8300), the API (:8200), the Next.js dashboard (:3000),
replay targets (:8101+) and the Claude Code fixers (git worktrees next to the target). Caddy terminates TLS on
`https://preflight.<ip-with-dashes>.sslip.io` and puts **basic auth** in front of both the dashboard and the API.
Everything is Terraform: `apply` brings it up, `destroy` removes it (including the Elastic IP).

Files:

| Path | What |
|---|---|
| `terraform/main.tf`, `variables.tf`, `outputs.tf` | AMI lookup, default VPC, security group, IAM role (read `/preflight/*` SSM parameters only), key pair, instance (40 GB gp3), EIP |
| `terraform/bootstrap.sh.tftpl` | user data: installs the toolchain, clones the repo at `git_ref`, materialises the target checkout, reads secrets from SSM, builds the dashboard, installs the units |
| `terraform/terraform.tfvars.example` | copy to `terraform.tfvars` (gitignored) |
| `preflight-{proxy,target,api,web}.service` | systemd units, run as user `preflight` |
| `Caddyfile` | TLS + basic auth; `/api/*` → :8200 (SSE unbuffered), everything else → :3000 |

## Sizing

Memory is what matters: `next start` ≈ 250 MB, API + proxy + target ≈ 400 MB, each `claude -p` fixer ≈ 400 MB, each replay target ≈ 120 MB.

| `instance_type` | RAM | Use | `fixers_max_parallel` |
|---|---|---|---|
| `t4g.small` | 2 GB | dashboard + find-only runs (`--no-fix`) + replays | 0 |
| **`t4g.medium`** (default) | 4 GB | everything, 2 fixers in parallel, 2 GB swapfile | 2 |
| `t4g.large` | 8 GB | 3 fixers at the Mac's speed | 3 |

## Cost (us-east-1, on-demand list prices, Oct 2026; verify in the console before launch)

| Item | Rate | 3-day judging window | Per month if left on |
|---|---|---|---|
| EC2 `t4g.medium` (default) | $0.0336/h | **$2.42** | $24.50 |
| EBS gp3 40 GB | $0.08/GB-mo | $0.32 | $3.20 |
| Public IPv4 / Elastic IP | $0.005/h | $0.36 | $3.65 |
| Data transfer out (dashboard + SSE, a few GB) | first 100 GB/mo free | ~$0 | ~$0 |
| SSM parameters, CloudWatch basic metrics, IAM | free | 0 | 0 |
| **AWS total** | | **≈ $3.10** | **≈ $31** |
| with `t4g.small` instead | $0.0168/h | ≈ $1.90 | ≈ $19 |
| with `t4g.large` instead | $0.0672/h | ≈ $5.50 | ≈ $56 |
| LLM usage during the window (not AWS): one full assessment ≈ $0.35 of LiteLLM | | $1–3 | n/a |
| Fixers on the Max token: metered against the subscription (≈ $1.4/attempt equivalent), not dollars | | 0 | 0 |

`terraform destroy` after judging → $0. An unattached Elastic IP would otherwise bill $3.65/month; destroy releases it.

## 1. Prerequisites (on your Mac)

- `aws` CLI configured for the account (`aws sts get-caller-identity` works).
- `terraform` ≥ 1.5 (`brew install terraform`, or download the binary).
- Claude Code logged in with the Max subscription, then `claude setup-token` → a long-lived `sk-ant-oat01-...` token. The fixers on the host use this token; **never** put an `ANTHROPIC_API_KEY` on the box, it would override it.
- A bcrypt hash for the judges' password: `docker run --rm caddy caddy hash-password --plaintext 'the-password'` (or `caddy hash-password` if Caddy is installed).
- Your public IP for SSH: `curl -s https://checkip.amazonaws.com`.

## 2. Secrets → SSM Parameter Store (once, SecureString; never in tfvars or state)

Placeholders only; paste the real values from your `.env` and from `claude setup-token`.

```bash
export AWS_REGION=us-east-1
put() { aws ssm put-parameter --name "/preflight/$1" --type SecureString --overwrite --value "$2"; }
put CLAUDE_CODE_OAUTH_TOKEN   'sk-ant-oat01-...'          # from `claude setup-token`
put LITELLM_API_KEY           'sk-...'
put NEATLOGS_API_KEY          '...'
put NEATLOGS_TOKEN            '...'                       # service-account token with observability:read
put NEATLOGS_PROJECT_ID       '2d5433a0-d4a3-45cf-99f8-aa80525d3d56'
put CRUSTDATA_API_KEY         '...'
put PREFLIGHT_OWNERSHIP_TOKEN "$(openssl rand -hex 24)"   # any random string; both repos get the same one
# optional: put LITELLM_BASE_URL 'https://litellm.vision.aivar.app/v1'   (that is the default when absent)
aws ssm get-parameters-by-path --path /preflight --query 'Parameters[].Name' --output table
```

The instance role may only read `/preflight/*` (`ssm:GetParameter*` + `kms:Decrypt` via SSM). Rotate a key by `put` again and
re-running the bootstrap (step 5) or rewriting the `.env` by hand and restarting the units.

## 3. Provision

```bash
cd deploy/aws/terraform
cp terraform.tfvars.example terraform.tfvars    # fill admin_cidr, ssh_public_key, judge_password_hash (+ instance_type)
terraform init
terraform plan
terraform apply                                  # ~1 min for AWS, then ~10 min of bootstrap on the box
terraform output                                 # public_ip, url, ssh, bootstrap_log
```
Or from the repo root: `make aws-up` / `make aws-down`.

Follow the bootstrap: `ssh ubuntu@<public_ip> sudo tail -f /var/log/preflight-bootstrap.log`. It ends with
`=== preflight bootstrap done ... https://preflight.<ip>.sslip.io ===`. Caddy fetches the Let's Encrypt certificate on
the first request (sslip.io resolves any `a-b-c-d.sslip.io` to `a.b.c.d`, so no DNS setup is needed).

## 4. URL and judge credentials

- URL: `terraform output -raw url` → `https://preflight.<ip-with-dashes>.sslip.io`.
- User: `judge_user` from `terraform.tfvars` (default `judge`). Password: the plaintext you hashed in step 1.
  Put both in the submission form, not in the repo.
- Smoke test: `curl -u judge:... https://<host>/api/assessments` returns the assessment list; the dashboard loads and
  the Pipeline view streams SSE events.

## 5. Runbook (on the box: `ssh ubuntu@<ip>`, then `sudo -iu preflight`)

| Task | Command |
|---|---|
| Service status | `systemctl status 'preflight-*' caddy` |
| API / fixer logs | `journalctl -u preflight-api -f` (fixer logs also under `/srv/preflight/ledger/<id>/fixes/`) |
| Target, proxy, web, Caddy logs | `journalctl -u preflight-target -f`, `-u preflight-proxy`, `-u preflight-web`, `-u caddy` |
| Seed the demo state | `cd /srv/preflight && scripts/demo-reset.sh /srv/acmesales-copilot && sudo systemctl restart preflight-target` |
| Smoke run | `cd /srv/preflight && uv run preflight run /srv/acmesales-copilot --mode dev --attacks D1 --seeds 3` |
| Full run | `uv run preflight run /srv/acmesales-copilot --mode full` (or Start from the dashboard) |
| **After `approve` or `demo-reset`** | `sudo systemctl restart preflight-target` (approve merges into `main`; the running target still serves the old code) |
| Re-read secrets after an SSM change | `sudo bash /var/lib/cloud/instance/scripts/part-001` (idempotent; rebuilds the dashboard too) |
| Update the code | `cd /srv/preflight && git stash && git pull && git stash pop && uv sync` then rebuild the web app and `sudo systemctl restart 'preflight-*'` (`config.yaml` carries the `max_parallel` edit, hence the stash) |
| Kill switch | `touch /srv/preflight/STOP` (or `uv run preflight stop`) |
| Resize | change `instance_type` in `terraform.tfvars`, `terraform apply` (the instance is replaced; the bootstrap reruns, the ledger on the box is lost; export it first with `uv run preflight db export`) |

Never run `entire enable` in `/srv/preflight` and never run interactive `claude` on the box: Entire snapshots
sessions of the repo it is enabled in and pushes them (see the 2026-10-11 incident in `DECISIONS.md`). The target
checkout `/srv/acmesales-copilot` is the only Entire-enabled repo, has no `origin`, and only sees `claude -p` fixer
sessions whose prompt is the brief.

## 6. Teardown

```bash
cd deploy/aws/terraform && terraform destroy       # or: make aws-down
```
Removes the instance, disk, security group, IAM role/profile, key pair and releases the Elastic IP. SSM parameters stay
(free); delete them with `aws ssm delete-parameters --names $(aws ssm get-parameters-by-path --path /preflight --query 'Parameters[].Name' --output text)`
when the token should no longer exist anywhere, and revoke the OAuth token in Claude settings.
To pause instead of destroy: `aws ec2 stop-instances --instance-ids <id>` (≈ $8.50/month for disk + IPv4).
