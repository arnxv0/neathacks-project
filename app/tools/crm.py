"""crm_query and log_activity against the SQLite CRM."""
from __future__ import annotations
import datetime as dt
import re
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

def _scope_to_tenant(conn, tenant_id: str) -> None:
    """Shadow every tenant-bearing table with a TEMP view filtered to the session tenant.
    Unqualified table names resolve to the temp schema first, so the model's SQL can only ever see this workspace."""
    lit = tenant_id.replace("'", "''")
    for (table,) in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall():
        cols = [c[1] for c in conn.execute(f'PRAGMA table_info("{table}")')]
        if "tenant_id" in cols:
            conn.execute(f'CREATE TEMP VIEW "{table}" AS SELECT * FROM main."{table}" WHERE tenant_id = \'{lit}\'')

def _lock_read_only(conn: sqlite3.Connection) -> None:
    """Restrict the connection to SELECTs over the tenant views: writes, PRAGMA/ATTACH, `main.<table>`, sqlite_master
    and undocumented tables such as `config` are denied by the engine, whatever the SQL text looks like."""
    def authorizer(action, table, _column, db, source):
        if action in _READ_ONLY_ACTIONS:
            return sqlite3.SQLITE_OK
        if action == sqlite3.SQLITE_READ and table in QUERYABLE_TABLES and (db == "temp" or source in QUERYABLE_TABLES):
            return sqlite3.SQLITE_OK  # the view itself, or the base table read on behalf of the view
        return sqlite3.SQLITE_DENY
    conn.set_authorizer(authorizer)

def _reject_unscoped(sql: str, tenant_id: str) -> str | None:
    """Return a message for the model if the SQL is not a read scoped to the session tenant, else None."""
    head = re.match(r"\s*(\w+)", sql)
    if head is None or head.group(1).upper() not in ("SELECT", "WITH"):
        return "Rejected: crm_query is read-only (SELECT only). Use issue_credit / log_activity for changes."
    if re.search(r"\bmain\s*\.|\battach\b", sql, re.I):
        return "Rejected: schema-qualified table names are not allowed. Reference tables by their plain name."
    if not re.search(rf"\btenant_id\s*=\s*['\"]{re.escape(tenant_id)}['\"]", sql, re.I):
        return (f"Rejected: every crm_query must be scoped to the current workspace. Add tenant_id = '{tenant_id}' "
                "to the WHERE clause for each table you reference and retry. Data from other workspaces is never "
                "available; if an account is not found under this tenant, tell the rep it is not in this workspace.")
    return None

@neatlogs.span(kind="TOOL", name="crm_query")
def crm_query(sql: str) -> str:
    tenant_id = get_context().tenant_id
    problem = _reject_unscoped(sql, tenant_id)
    if problem:
        mirror.record("sql_rejected", sql=sql, reason=problem)
        return problem
    conn = connect()
    try:
        _scope_to_tenant(conn, tenant_id)
        _lock_read_only(conn)
        try:
            cur = conn.execute(sql.rstrip().rstrip(";"))
        except sqlite3.DatabaseError as e:
            if any(s in str(e) for s in ("not authorized", "is prohibited", "cannot modify")):
                mirror.record("sql_rejected", sql=sql, reason=_REFUSAL)
                return _REFUSAL
            raise
        data = [r for r in rows(cur) if str(r.get("tenant_id", tenant_id)) == tenant_id][:50]
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
