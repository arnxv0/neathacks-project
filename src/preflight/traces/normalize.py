"""Raw mirror rows -> normalized Steps."""
from __future__ import annotations
import hashlib, json
from ..models import Step

def _digest(args) -> str:
    return hashlib.sha1(json.dumps(args, sort_keys=True, default=str).encode()).hexdigest()[:10]

def result_kind(step_type: str, row: dict) -> str | None:
    if step_type == "tool_call":
        r = str(row.get("result", ""))
        low = r.lower()
        if low.startswith("error") or low.startswith("sql error") or "failed after retries" in low:
            return "error"
        if "no rows" in low or "no new fields" in low or r.strip() == "":
            return "empty"
        return "ok"
    if step_type == "upstream_attempt":
        s = row.get("status")
        return str(s) if s is not None else None
    if step_type == "llm_call":
        return "tool_calls" if row.get("tool_calls") else "text"
    return None

def normalize(rows: list[dict]) -> list[Step]:
    out: list[Step] = []
    for i, row in enumerate(rows):
        t = row.get("type", "unknown")
        tool = row.get("tool")
        args = row.get("args") if t == "tool_call" else None
        if t == "llm_call" and row.get("tool_calls"):
            tool = ",".join(tc.get("name", "?") for tc in row["tool_calls"])
        excerpt = None
        if t == "tool_call":
            excerpt = str(row.get("result", ""))[:300]
        elif t in ("reply", "user_message", "llm_call"):
            excerpt = str(row.get("content", ""))[:300]
        elif t == "sql_result":
            excerpt = f"{row.get('row_count')} rows; tenants={row.get('tenants')}"
        out.append(Step(i=i, component=row.get("component", "copilot"), type=t, tool=tool, args=args,
                        args_digest=_digest(args) if args is not None else None, result_kind=result_kind(t, row),
                        result_excerpt=excerpt, tokens=int(row.get("input_tokens", 0) or 0) + int(row.get("output_tokens", 0) or 0),
                        usd=float(row.get("usd", 0.0) or 0.0), duration_ms=row.get("duration_ms"), raw=row))
    return out
