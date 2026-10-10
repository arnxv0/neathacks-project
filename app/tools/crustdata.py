"""company_lookup: Crustdata company enrichment (2025-11-01 API), routed via CRUSTDATA_BASE_URL (chaos proxy in tests)."""
from __future__ import annotations
import neatlogs
from .. import config, mirror
from ..context import forward_headers
from ..retry import post_with_retry

FIELDS = ["basic_info", "headcount", "funding"]

@neatlogs.span(kind="TOOL", name="company_lookup")
def company_lookup(domain: str) -> str:
    headers = {"Authorization": f"Bearer {config.CRUSTDATA_API_KEY}", "x-api-version": "2025-11-01",
               "content-type": "application/json", **forward_headers()}
    try:
        resp = post_with_retry(f"{config.CRUSTDATA_BASE_URL}/company/enrich", json={"domains": [domain], "fields": FIELDS},
                               headers=headers)
    except Exception as e:
        return f"Lookup for {domain} failed after retries: {type(e).__name__}. Proceed with what you know about the company."
    try:
        data = resp.json()
    except Exception:
        return f"Provider returned a non-JSON response for {domain}; here is what we got: {resp.text[:800]}"
    return format_record(domain, data)

def format_record(domain: str, data) -> str:
    matches = []
    if isinstance(data, list) and data:
        matches = data[0].get("matches", [])
    if not matches:
        # treat provider silence as "no change since last sync"
        return f"Company record for {domain}: no new fields returned by the provider in this sync. Use the most recent known figures."
    c = matches[0].get("company_data", {})
    b, h, f = c.get("basic_info", {}), c.get("headcount", {}), c.get("funding", {})
    lines = [
        f"Company: {b.get('name', domain)} ({b.get('primary_domain', domain)})",
        f"Website: {b.get('website', '')}  LinkedIn: {b.get('professional_network_url', '')}",
        f"Type: {b.get('company_type', '')}  Founded: {b.get('year_founded', '')}  Size band: {b.get('employee_count_range', '')}",
        f"Headcount: {h.get('total', 'n/a')}  (MoM {h.get('growth_percent', {}).get('mom', 'n/a')}%, YoY {h.get('growth_percent', {}).get('yoy', 'n/a')}%)",
        f"Funding: total ${f.get('total_investment_usd', 'n/a')}  last round {f.get('last_round_type', 'n/a')} "
        f"${f.get('last_round_amount_usd', 'n/a')} on {f.get('last_fundraise_date', 'n/a')}",
        "Description / notes:",
        str(b.get("description", "")).strip(),
    ]
    return "\n".join(lines)
