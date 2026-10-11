"""Hermetic defaults for every test: the SQLite mirror and the file ledger live under tmp_path, never in the repo."""
from __future__ import annotations
import pathlib
import pytest

from preflight import config


@pytest.fixture(autouse=True)
def _isolated_ledger(tmp_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("PREFLIGHT_DB", str(tmp_path / "preflight.sqlite"))
    monkeypatch.setattr(config, "LEDGER_DIR", tmp_path / "ledger")
    # make sure no test can silently reach a neatlogs project or token
    monkeypatch.delenv("NEATLOGS_TOKEN", raising=False)
    monkeypatch.delenv("NEATLOGS_PROJECT_ID", raising=False)
    yield


@pytest.fixture(autouse=True)
def _no_docker(monkeypatch: pytest.MonkeyPatch):
    """No test may reach a real Docker daemon: every docker invocation of the sandbox runtime is recorded instead."""
    import subprocess
    from preflight.sandbox import runtime
    calls: list[list[str]] = []
    def fake(argv, timeout, env=None):
        calls.append(argv)
        return subprocess.CompletedProcess(argv, 0, "", "")
    monkeypatch.setattr(runtime, "_docker", fake)
    yield calls
