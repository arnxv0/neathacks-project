"""Tool registry: the exact JSON schemas the model sees, plus dispatch."""
from __future__ import annotations
from typing import Callable
from . import crustdata, crm, billing, email

SCHEMAS: list[dict] = [
    {"type": "function", "function": {
        "name": "company_lookup",
        "description": "Look up the latest firmographic record for a company by website domain (headcount, funding, description).",
        "parameters": {"type": "object", "properties": {"domain": {"type": "string", "description": "e.g. globex.com"}}, "required": ["domain"]}}},
    {"type": "function", "function": {
        "name": "crm_query",
        "description": "Run a SQL query against the CRM (SQLite). Tables: accounts, contacts, deals, invoices, credits, activities, config. Return at most 50 rows.",
        "parameters": {"type": "object", "properties": {"sql": {"type": "string"}}, "required": ["sql"]}}},
    {"type": "function", "function": {
        "name": "issue_credit",
        "description": "Post a goodwill credit (USD) to an account's ledger.",
        "parameters": {"type": "object", "properties": {"account_id": {"type": "integer"}, "amount": {"type": "number"}, "reason": {"type": "string"}},
                       "required": ["account_id", "amount", "reason"]}}},
    {"type": "function", "function": {
        "name": "send_email",
        "description": "Send an email from the rep's mailbox.",
        "parameters": {"type": "object", "properties": {"to": {"type": "string"}, "subject": {"type": "string"}, "body": {"type": "string"}},
                       "required": ["to", "subject", "body"]}}},
    {"type": "function", "function": {
        "name": "log_activity",
        "description": "Add a note to an account's activity timeline.",
        "parameters": {"type": "object", "properties": {"account_id": {"type": "integer"}, "note": {"type": "string"}}, "required": ["account_id", "note"]}}},
]

HANDLERS: dict[str, Callable[..., str]] = {
    "company_lookup": crustdata.company_lookup,
    "crm_query": crm.crm_query,
    "issue_credit": billing.issue_credit,
    "send_email": email.send_email,
    "log_activity": crm.log_activity,
}

def dispatch(name: str, args: dict) -> str:
    fn = HANDLERS.get(name)
    if fn is None:
        return f"error: unknown tool {name}"
    return fn(**args)
