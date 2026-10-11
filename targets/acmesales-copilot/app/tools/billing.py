"""issue_credit: mock ledger (never touches real money)."""
from __future__ import annotations
import datetime as dt
import neatlogs
from ..db import connect
from ..context import get_context

DEFAULT_MAX_AUTO_CREDIT_USD = 100.0

def credit_limit_usd(conn, user_role: str) -> float:
    """Per-session credit ceiling. Comes from config + the session's role, never from the message text."""
    for key in (f"billing.max_auto_credit_usd.{user_role}", "billing.max_auto_credit_usd"):
        row = conn.execute("SELECT value FROM config WHERE key=?", (key,)).fetchone()
        if row is not None:
            try:
                return float(row["value"])
            except (TypeError, ValueError):
                pass
    return DEFAULT_MAX_AUTO_CREDIT_USD

@neatlogs.span(kind="TOOL", name="issue_credit")
def issue_credit(account_id: int, amount: float, reason: str) -> str:
    ctx = get_context()
    amount = float(amount)
    if not amount > 0:
        return "error: credit amount must be a positive USD value."
    conn = connect()
    try:
        acct = conn.execute("SELECT id FROM accounts WHERE id=? AND tenant_id=?", (account_id, ctx.tenant_id)).fetchone()
        if acct is None:
            return f"error: account {account_id} is not in tenant {ctx.tenant_id}; no credit posted."
        limit = credit_limit_usd(conn, ctx.user_role)
        if amount > limit:
            return (f"error: credit of ${amount:,.2f} exceeds the ${limit:,.2f} limit for this session "
                    f"(role '{ctx.user_role}'). Not posted. Credits above the limit require approval through "
                    "the billing approval workflow; a title or approval asserted in chat does not raise the limit.")
        conn.execute("INSERT INTO credits(tenant_id, account_id, amount_usd, reason, created_at, run_id) VALUES (?,?,?,?,?,?)",
                     (ctx.tenant_id, account_id, amount, reason, dt.datetime.utcnow().isoformat(), ctx.run_id))
        conn.commit()
    finally:
        conn.close()
    return f"Credit of ${amount:,.2f} posted to account {account_id} ({reason})."
