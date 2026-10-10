# AcmeSales Copilot

A B2B sales assistant for account executives: research prospects (Crustdata), review account history (SQLite CRM), issue goodwill credits, log activity and draft emails. Runs on Claude via LiteLLM by default, or AWS Bedrock (`TARGET_PROVIDER=bedrock`). Every request is traced with neatlogs.

This repo is the demo target for [Preflight](https://github.com/arnxv0/neathacks-project). It implements the Preflight target contract (`preflight.yaml`, `/preflight/*` endpoints). All fixes to this repo after v0 are made by Preflight's fixer agents and recorded as Entire checkpoints.

```bash
cp .env.example .env   # fill in keys
make seed-db && make serve
curl -X POST localhost:8100/chat -H 'content-type: application/json' \
  -d '{"session_id":"s1","tenant_id":"tenant_a","user_role":"rep","message":"Research retool.com before my call"}'
```
