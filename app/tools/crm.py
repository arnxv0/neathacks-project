"""crm_query and log_activity against the SQLite CRM."""
from __future__ import annotations
import datetime as dt
import sqlite3
import neatlogs
from ..db import connect, rows
from ..context import get_context
from .. import mirror

# Tables the model may read through crm_query. Everything else (config, outbox, sqlite_master, ...) is off-limits.
QUERYABLE_TABLES = ("accounts", "contacts", "deals", "invoices", "credits", "activities")
_READ_ONLY_ACTIONS = {sqlite3.SQLITE_SELECT, sqlite3.SQLITE_FUNCTION, sqlite3.SQLITE_RECURSIVE}
_REFUSAL = ("crm_query refused: it only runs SELECT statements over " + ", ".join(QUERYABLE_TABLES) +
            ", and results are always limited to your own tenant. Writes, PRAGMAs and the config table are not available.")

def _lock_to_tenant(conn: sqlite3.Connection, tenant_id: str) -> None:
    """Shadow each CRM table with a TEMP view filtered to the session tenant, then restrict the connection to
    SELECTs over those views. Unqualified names resolve to the temp schema first, so `FROM accounts` is scoped
    even if the model forgets the tenant_id predicate; `main.accounts`, writes and other tables are denied."""
    tenant_literal = tenant_id.replace("'", "''")
    for table in QUERYABLE_TABLES:
        conn.execute(f"CREATE TEMP VIEW {table} AS SELECT * FROM main.{table} WHERE tenant_id = '{tenant_literal}'")

    def authorizer(action, table, _column, db, source):
        if action in _READ_ONLY_ACTIONS:
            return sqlite3.SQLITE_OK
        if action == sqlite3.SQLITE_READ and table in QUERYABLE_TABLES and (db == "temp" or source in QUERYABLE_TABLES):
            return sqlite3.SQLITE_OK  # the view itself, or the base table read on behalf of the view
        return sqlite3.SQLITE_DENY

    conn.set_authorizer(authorizer)

@neatlogs.span(kind="TOOL", name="crm_query")
def crm_query(sql: str) -> str:
    ctx = get_context()
    conn = connect()
    try:
        _lock_to_tenant(conn, ctx.tenant_id)
        try:
            cur = conn.execute(sql.rstrip().rstrip(";"))
        except sqlite3.DatabaseError as e:
            if any(s in str(e) for s in ("not authorized", "is prohibited", "cannot modify")):
                return _REFUSAL
            raise
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
