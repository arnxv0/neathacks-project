"""/api/targets and `POST /api/assessments {target}` with FastAPI's TestClient; sandbox root in tmp_path, no network,
no Docker, no claude, no subprocess started for assessments."""
from __future__ import annotations
import pathlib, time
import pytest
from fastapi.testclient import TestClient

from preflight.sandbox import clone, onboard, registry, runtime
from preflight.web import app as webapp
import sandbox_fixtures as fx

URL = "https://github.com/acme/tiny-agent"
SLUG = "acme--tiny-agent"

@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("PREFLIGHT_SANDBOX_DIR", str(tmp_path / "sbx"))
    monkeypatch.delenv("PREFLIGHT_ALLOW_UNSANDBOXED", raising=False)
    monkeypatch.setattr(runtime, "docker_available", lambda refresh=False: True)
    return TestClient(webapp.app)

def serve(tmp_path, monkeypatch, files):
    src = fx.bare_repo(tmp_path, files)
    monkeypatch.setattr(clone, "source_for", lambda u: src)

def wait_for(client, slug, leaving: str) -> dict:
    for _ in range(200):
        body = client.get(f"/api/targets/{slug}").json()
        if body["status"] != leaving:
            return body
        time.sleep(0.05)
    raise AssertionError(f"still {leaving}")

def test_list_starts_with_the_builtin_target(client):
    body = client.get("/api/targets").json()
    assert [t["slug"] for t in body["targets"]] == ["builtin"] and body["targets"][0]["kind"] == "builtin"
    assert body["docker_available"] is True and body["sandbox_root"].endswith("sbx")

@pytest.mark.parametrize("url", ["git@github.com:a/b.git", "https://gitlab.com/a/b", "https://github.com/a/b/../c", "https://github.com/a/b?x=1", ""])
def test_add_rejects_bad_urls(client, url):
    r = client.post("/api/targets", json={"url": url})
    assert r.status_code == 400 and r.json()["detail"]["code"] == "invalid_url"
    assert len(client.get("/api/targets").json()["targets"]) == 1

def test_add_in_background_then_poll(client, tmp_path, monkeypatch):
    serve(tmp_path, monkeypatch, fx.OPENAI_AGENT)
    r = client.post("/api/targets", json={"url": URL + ".git"})
    assert r.status_code == 202 and r.json()["slug"] == SLUG and r.json()["status"] == "cloning" and r.json()["busy"] is True
    body = wait_for(client, SLUG, "cloning")
    assert body["status"] == "cloned" and body["stack"]["frameworks"] == ["openai"] and body["manifest"] is None and body["find_only"] is True
    assert body["runtime"]["running"] is False and "approved_fingerprint" not in body
    assert client.post("/api/targets", json={"url": URL}).status_code == 409
    assert [t["slug"] for t in client.get("/api/targets").json()["targets"]] == ["builtin", SLUG]

def test_add_too_large_is_413_and_leaves_nothing(client, tmp_path, monkeypatch):
    serve(tmp_path, monkeypatch, {**fx.OPENAI_AGENT, "big.bin": "x" * 50_000})
    monkeypatch.setenv("PREFLIGHT_SANDBOX_MAX_MB", "0.001")
    r = client.post("/api/targets?wait=true", json={"url": URL})
    assert r.status_code == 413 and r.json()["detail"]["code"] == "too_large"
    assert client.get(f"/api/targets/{SLUG}").status_code == 404

def test_background_failure_is_kept_on_the_entry(client, tmp_path, monkeypatch):
    monkeypatch.setattr(clone, "source_for", lambda u: f"file://{tmp_path}/missing.git")
    assert client.post("/api/targets", json={"url": URL}).status_code == 202
    body = wait_for(client, SLUG, "cloning")
    assert body["status"] == "error" and body["error_code"] == "clone_failed" and body["last_error"]
    assert client.delete(f"/api/targets/{SLUG}").json() == {"ok": True, "slug": SLUG}

def test_onboard_review_approve_run_flow(client, tmp_path, monkeypatch):
    serve(tmp_path, monkeypatch, fx.OPENAI_AGENT)
    assert client.post("/api/targets?wait=true", json={"url": URL}).json()["status"] == "cloned"
    started = []
    monkeypatch.setattr(webapp, "_cli", lambda *args, log=None: started.append(args) or type("P", (), {"pid": 1})())
    monkeypatch.setattr(webapp, "list_assessments", lambda: [f"a{i + 1}" for i in range(len(started))])

    r = client.post("/api/assessments", json={"target": SLUG})                        # cloned, not approved
    assert r.status_code == 409 and r.json()["detail"]["code"] == "not_approved" and not started
    assert client.post(f"/api/targets/{SLUG}/approve").status_code == 409

    def launcher(argv, cwd, log_path, timeout_s):
        fx.write_tree(pathlib.Path(cwd), {"preflight.yaml": fx.MANIFEST, "preflight_adapter.py": fx.ADAPTER})
        return 0
    monkeypatch.setattr(onboard, "launch", launcher)
    r = client.post(f"/api/targets/{SLUG}/onboard")
    assert r.status_code == 202 and r.json()["status"] == "onboarding"
    body = wait_for(client, SLUG, "onboarding")
    assert body["status"] == "needs_review" and "+++ b/preflight_adapter.py" in body["onboard_patch"]
    assert body["manifest"].startswith("system: tiny") and "Onboarding brief" in body["brief"]
    assert client.post("/api/assessments", json={"target": SLUG}).status_code == 409   # still not approved

    r = client.post(f"/api/targets/{SLUG}/approve")
    assert r.status_code == 200 and r.json()["status"] == "ready" and r.json()["approved_at"]

    r = client.post("/api/assessments", json={"target": SLUG, "mode": "dev", "attacks": "A1"})
    assert r.status_code == 200 and r.json()["assessment_id"] == "a1"
    args = started[-1]
    assert args[:2] == ("run", str(registry.clone_dir(SLUG))) and "--no-fix" in args and "--allow-fix" not in args   # find-only by default

    r = client.post("/api/assessments", json={"target": SLUG, "allow_fix": True})      # not trusted
    assert r.status_code == 403 and r.json()["detail"]["code"] == "fix_requires_trust"
    assert client.post(f"/api/targets/{SLUG}/trust", json={"trusted": True}).json()["trusted"] is True
    assert client.post("/api/assessments", json={"target": SLUG, "allow_fix": True}).status_code == 200
    assert "--allow-fix" in started[-1] and "--no-fix" not in started[-1]

    monkeypatch.setattr(runtime, "docker_available", lambda refresh=False: False)
    client.post(f"/api/targets/{SLUG}/trust", json={"trusted": False})
    r = client.post("/api/assessments", json={"target": SLUG})
    assert r.status_code == 503 and r.json()["detail"]["code"] == "docker_unavailable"

    assert client.delete(f"/api/targets/{SLUG}").status_code == 200
    assert client.get(f"/api/targets/{SLUG}").status_code == 404 and not registry.targets_dir().joinpath(SLUG).exists()
    assert client.post("/api/assessments", json={"target": SLUG}).status_code == 404

def test_contract_native_repo_cannot_be_onboarded_only_approved(client, tmp_path, monkeypatch):
    serve(tmp_path, monkeypatch, fx.NATIVE)
    body = client.post("/api/targets?wait=true", json={"url": URL}).json()
    assert body["status"] == "needs_review" and body["contract_native"] is True
    assert client.post(f"/api/targets/{SLUG}/onboard").status_code == 409
    assert client.post(f"/api/targets/{SLUG}/approve").json()["status"] == "ready"

def test_unknown_and_malformed_slugs_are_404(client):
    for path in ("/api/targets/nope", "/api/targets/..%2F..%2Fetc", "/api/targets/A--B"):
        assert client.get(path).status_code == 404
    assert client.post("/api/targets/nope/approve").status_code == 404
    assert client.post("/api/targets/nope/onboard").status_code == 404
    assert client.post("/api/targets/nope/trust", json={"trusted": True}).status_code == 404
    assert client.delete("/api/targets/nope").status_code == 404
    assert client.delete("/api/targets/builtin").status_code == 400

def test_builtin_target_and_legacy_body_still_work(client, monkeypatch):
    started = []
    monkeypatch.setattr(webapp, "_cli", lambda *args, log=None: started.append(args) or type("P", (), {"pid": 1})())
    monkeypatch.setattr(webapp, "list_assessments", lambda: [f"a{i + 1}" for i in range(len(started))])
    assert client.post("/api/assessments", json={"target": "builtin", "no_fix": True}).status_code == 200
    assert started[-1][1].endswith("acmesales-copilot") and "--no-fix" in started[-1]
    assert client.post("/api/assessments", json={"target_dir": "/some/dir"}).status_code == 200
    assert started[-1][:2] == ("run", "/some/dir") and "--no-fix" not in started[-1] and "--allow-fix" not in started[-1]
    assert client.get("/api/targets/builtin").json()["kind"] == "builtin"

def test_busy_target_cannot_be_deleted_unless_its_job_is_dead(client):
    e = registry.create(URL)                                   # status `cloning`, no worker behind it
    r = client.delete(f"/api/targets/{SLUG}")
    assert r.status_code == 409 and r.json()["detail"]["code"] == "invalid_state"
    e.updated_at = "2020-01-01T00:00:00+00:00"
    registry.meta_path(SLUG, ".json").write_text(e.model_dump_json())
    assert client.get(f"/api/targets/{SLUG}").json()["busy"] is False
    assert client.delete(f"/api/targets/{SLUG}").status_code == 200
