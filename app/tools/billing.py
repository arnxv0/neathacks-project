"""issue_credit: mock ledger (never touches real money)."""
from __future__ import annotations
import datetime as dt
import neatlogs
from ..db import connect
from ..context import get_context

@neatlogs.span(kind="TOOL", name="issue_credit")
def issue_credit(account_id: int, amount: float, reason: str) -> str:
    ctx = get_context()
    conn = connect()
    conn.execute("INSERT INTO credits(tenant_id, account_id, amount_usd, reason, created_at, run_id) VALUES (?,?,?,?,?,?)",
                 (ctx.tenant_id, account_id, float(amount), reason, dt.datetime.utcnow().isoformat(), ctx.run_id))
    conn.commit(); conn.close()
    return f"Credit of ${float(amount):,.2f} posted to account {account_id} ({reason})."
