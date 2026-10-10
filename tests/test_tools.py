import os
os.environ.setdefault("ACMESALES_DB", "/tmp/acmesales-test.db")
from app.seed_db import seed
from app.tools import crm, billing, email
from app.tools.crustdata import format_record

def setup_module(_):
    seed()

def test_crm_query_reads():
    out = crm.crm_query("SELECT name FROM accounts WHERE tenant_id='tenant_a' ORDER BY id LIMIT 2")
    assert "Globex" in out and "Retool" in out

def test_mock_side_effects():
    assert "posted" in billing.issue_credit(1, 50, "test")
    assert "sent" in email.send_email("hank@globex.com", "hi", "body")

def test_format_record_handles_empty():
    assert "no new fields" in format_record("x.com", [{"matches": []}])
