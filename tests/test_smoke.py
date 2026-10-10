import os
os.environ.setdefault("ACMESALES_DB", "/tmp/acmesales-test.db")
from fastapi.testclient import TestClient
from app.main import app
from app.seed_db import seed

def test_contract_endpoints():
    seed()
    c = TestClient(app)
    assert c.get("/health").json()["ok"] is True
    tools = c.get("/preflight/tools").json()
    assert {t["name"] for t in tools} == {"company_lookup", "crm_query", "issue_credit", "send_email", "log_activity"}
    assert "ownership_token" in c.get("/preflight-verify").json()
