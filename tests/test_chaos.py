"""Chaos fault mapping (faults.apply) and the proxy's header handling, in-process via TestClient (no server, no upstream)."""
from __future__ import annotations
import asyncio
import json

import pytest
from fastapi.responses import Response
from fastapi.testclient import TestClient

from preflight.chaos import faults, fixtures, proxy

UPSTREAM_BODY = json.dumps([{"matched_on": "globex.com", "match_type": "domain",
                             "matches": [{"basic_info": {"name": "Globex"}, "headcount": 1200}]}]).encode()


def _apply(fault, upstream=None):
    return asyncio.run(faults.apply(fault, upstream))


def _upstream() -> Response:
    return Response(content=UPSTREAM_BODY, media_type="application/json")


# ---------------- faults.apply ----------------

@pytest.mark.parametrize("fault", [None, "", "no-such-fault"])
def test_no_fault_or_unknown_passes_through(fault):
    assert _apply(fault, _upstream()) is None


def test_429_sets_retry_after_default_and_arg():
    r = _apply("429")
    assert r.status_code == 429 and r.headers["retry-after"] == "2"
    assert json.loads(r.body)["error"]["type"] == "rate_limited"
    assert _apply("429:7").headers["retry-after"] == "7"


@pytest.mark.parametrize("code", ["500", "502", "503"])
def test_5xx_faults(code):
    r = _apply(code)
    assert r.status_code == int(code)
    assert json.loads(r.body)["error"]["type"] == "server_error"


def test_empty_returns_a_valid_no_match_payload():
    r = _apply("empty")
    assert r.status_code == 200
    assert json.loads(r.body) == [{"matched_on": "", "match_type": "domain", "matches": []}]


def test_timeout_with_zero_delay_is_a_504():
    r = _apply("timeout:0")
    assert r.status_code == 504 and r.body == b"upstream timeout"


def test_slow_with_zero_delay_passes_through():
    assert _apply("slow:0", _upstream()) is None


def test_truncate_cuts_body_to_a_third_and_needs_upstream():
    r = _apply("truncate", _upstream())
    assert len(r.body) == max(10, len(UPSTREAM_BODY) // 3)
    assert UPSTREAM_BODY.startswith(r.body)
    with pytest.raises(Exception):
        json.loads(r.body)
    assert _apply("truncate", None) is None


def test_rename_swaps_field_names_and_keeps_values():
    r = _apply("rename", _upstream())
    data = json.loads(r.body)
    m = data[0]["matches"][0]
    assert "employees" in m and "headcount" not in m and m["employees"] == 1200
    assert "basicInfo" in m and "basic_info" not in m


def test_rename_on_non_json_upstream_passes_through():
    assert _apply("rename", Response(content=b"<html>", media_type="text/html")) is None


def test_garbage_is_html_with_200():
    r = _apply("garbage")
    assert r.media_type == "text/html" and b"502 Bad Gateway" in r.body


# ---------------- proxy relay (in-process) ----------------

@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(fixtures, "CACHE", tmp_path / "cache")
    monkeypatch.setattr(fixtures, "POISONED", tmp_path / "poisoned")
    monkeypatch.setattr(proxy, "OFFLINE", True)          # never reach a real upstream
    monkeypatch.setattr(proxy, "LOG", [])
    (tmp_path / "poisoned").mkdir()
    (tmp_path / "poisoned" / "injected_notes.json").write_bytes(b'{"poison": true}')
    (tmp_path / "cache").mkdir()
    (tmp_path / "cache" / "enrich_globex.com.json").write_bytes(UPSTREAM_BODY)
    return TestClient(proxy.app)


def test_proxy_health_reports_offline(client):
    assert client.get("/health").json()["offline"] is True


def test_proxy_pre_fault_short_circuits_before_fixture_or_upstream(client):
    r = client.post("/company/enrich", content=b"{}", headers={"X-Preflight-Fault": "429:3", "X-Preflight-Run-Id": "run-1"})
    assert r.status_code == 429 and r.headers["retry-after"] == "3"
    assert proxy.LOG[-1] == {"run_id": "run-1", "path": "company/enrich", "fault": "429:3", "fixture": None}


def test_proxy_serves_poisoned_fixture_and_500s_on_unknown(client):
    r = client.post("/company/enrich", content=b"{}", headers={"X-Preflight-Fixture": "injected_notes"})
    assert r.status_code == 200 and r.json() == {"poison": True}
    r = client.post("/company/enrich", content=b"{}", headers={"X-Preflight-Fixture": "does_not_exist"})
    assert r.status_code == 500 and "unknown fixture" in r.json()["error"]


def test_proxy_offline_without_cache_returns_empty_match(client):
    r = client.post("/company/enrich", content=json.dumps({"domains": ["unknown.example"]}))
    assert r.status_code == 200 and r.json()[0]["matches"] == []


def test_proxy_applies_post_faults_to_cached_upstream(client):
    body = json.dumps({"domains": ["globex.com"]})
    plain = client.post("/company/enrich", content=body)
    assert plain.content == UPSTREAM_BODY
    renamed = client.post("/company/enrich", content=body, headers={"X-Preflight-Fault": "rename"})
    assert "employees" in renamed.json()[0]["matches"][0]
    truncated = client.post("/company/enrich", content=body, headers={"X-Preflight-Fault": "truncate"})
    assert len(truncated.content) == len(UPSTREAM_BODY) // 3
