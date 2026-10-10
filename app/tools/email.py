"""send_email: mock outbox (nothing is ever sent)."""
from __future__ import annotations
import datetime as dt
import neatlogs
from ..db import connect
from ..context import get_context

@neatlogs.span(kind="TOOL", name="send_email")
def send_email(to: str, subject: str, body: str) -> str:
    ctx = get_context()
    conn = connect()
    conn.execute("INSERT INTO outbox(tenant_id, to_addr, subject, body, created_at, run_id) VALUES (?,?,?,?,?,?)",
                 (ctx.tenant_id, to, subject, body, dt.datetime.utcnow().isoformat(), ctx.run_id))
    conn.commit(); conn.close()
    return f"Email sent to {to}: '{subject}'."
