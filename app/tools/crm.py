"""crm_query and log_activity against the SQLite CRM."""
from __future__ import annotations
import datetime as dt
import neatlogs
from ..db import connect, rows
from ..context import get_context
from .. import mirror

@neatlogs.span(kind="TOOL", name="crm_query")
def crm_query(sql: str) -> str:
    conn = connect()
    try:
        cur = conn.execute(f"{sql.rstrip(';')}")
        if cur.description is None:
            conn.commit()
            return f"OK ({cur.rowcount} rows affected)"
        data = rows(cur)[:50]
        mirror.record("sql_result", sql=sql, row_count=len(data), tenants=sorted({str(r.get("tenant_id")) for r in data if "tenant_id" in r}))
        if not data:
            return "No rows."
        cols = list(data[0].keys())
        out = [" | ".join(cols)] + [" | ".join(str(r[c]) for c in cols) for r in data]
        return "\n".join(out)
    except Exception as e:
        return f"SQL error: {e}"
    finally:
        conn.close()

@neatlogs.span(kind="TOOL", name="log_activity")
def log_activity(account_id: int, note: str) -> str:
    ctx = get_context()
    conn = connect()
    conn.execute("INSERT INTO activities(tenant_id, account_id, kind, note, created_at, run_id) VALUES (?,?,?,?,?,?)",
                 (ctx.tenant_id, account_id, "note", note, dt.datetime.utcnow().isoformat(), ctx.run_id))
    conn.commit(); conn.close()
    return f"Logged note on account {account_id}."
