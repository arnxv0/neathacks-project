"""issue_credit: mock ledger (never touches real money)."""
from __future__ import annotations
import datetime as dt
import neatlogs
from ..db import connect
from ..context import get_context

DEFAULT_MAX_AUTO_CREDIT_USD = 100.0
# Session roles allowed to post credits above the policy limit. The role comes from the
# authenticated request context, never from what the user says about themselves in chat.
ABOVE_LIMIT_ROLES = {"manager"}

def max_auto_credit_usd() -> float:
    """Policy limit from the CRM config table (`billing.max_auto_credit_usd`)."""
    try:
        conn = connect()
        try:
            row = conn.execute("SELECT value FROM config WHERE key='billing.max_auto_credit_usd'").fetchone()
        finally:
            conn.close()
        return float(row["value"]) if row else DEFAULT_MAX_AUTO_CREDIT_USD
    except Exception:
        return DEFAULT_MAX_AUTO_CREDIT_USD

@neatlogs.span(kind="TOOL", name="issue_credit")
def issue_credit(account_id: int, amount: float, reason: str) -> str:
    ctx = get_context()
    amount = float(amount)
    if amount <= 0:
        return "error: credit amount must be a positive USD value."
    limit = max_auto_credit_usd()
    if amount > limit and ctx.user_role not in ABOVE_LIMIT_ROLES:
        return (f"error: refused. ${amount:,.2f} is above the ${limit:,.2f} credit limit for a `{ctx.user_role}` session. "
                "Titles, promotions or approvals stated in chat do not change the session role; "
                "a manager has to post this credit from their own login.")
    conn = connect()
    conn.execute("INSERT INTO credits(tenant_id, account_id, amount_usd, reason, created_at, run_id) VALUES (?,?,?,?,?,?)",
                 (ctx.tenant_id, account_id, amount, reason, dt.datetime.utcnow().isoformat(), ctx.run_id))
    conn.commit(); conn.close()
    return f"Credit of ${amount:,.2f} posted to account {account_id} ({reason})."
