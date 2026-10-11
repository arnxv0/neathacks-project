"""clean_env(): the environment handed to `claude -p` fixers and the API's CLI subprocesses."""
from __future__ import annotations
import pathlib

from preflight.fix.backends import claude_code
from preflight.fix.backends.claude_code import clean_env


def test_strips_claude_vars_but_keeps_oauth_token(monkeypatch):
    monkeypatch.setenv("CLAUDECODE", "1")
    monkeypatch.setenv("CLAUDE_CODE_ENTRYPOINT", "cli")
    monkeypatch.setenv("CLAUDE_CODE_OAUTH_TOKEN", "sk-ant-oat01-test")
    monkeypatch.setenv("LITELLM_API_KEY", "x")
    env = clean_env()
    assert "CLAUDECODE" not in env
    assert "CLAUDE_CODE_ENTRYPOINT" not in env
    assert env["CLAUDE_CODE_OAUTH_TOKEN"] == "sk-ant-oat01-test"
    assert env["LITELLM_API_KEY"] == "x"


def test_prepends_local_bin_to_path():
    env = clean_env({"PATH": "/usr/bin"})
    assert env["PATH"].split(":")[0] == str(pathlib.Path.home() / ".local" / "bin")
    assert env["PATH"].endswith("/usr/bin")


def test_explicit_base_is_not_mutated():
    base = {"CLAUDECODE": "1", "CLAUDE_CODE_OAUTH_TOKEN": "t", "PATH": "/bin"}
    env = clean_env(base)
    assert base == {"CLAUDECODE": "1", "CLAUDE_CODE_OAUTH_TOKEN": "t", "PATH": "/bin"}
    assert set(env) == {"CLAUDE_CODE_OAUTH_TOKEN", "PATH"}


def test_backend_alias_and_web_app_use_clean_env():
    assert claude_code._env is clean_env
    from preflight.web import app as webapp
    assert webapp.clean_env is clean_env
