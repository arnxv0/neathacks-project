"""Sandbox targets: hermetic (no network, no Docker, no claude). A local bare repo stands in for GitHub through the
single `clone.source_for` seam; URL validation is never bypassed."""
from __future__ import annotations
import pathlib
import pytest

from preflight.models import AttackSpec
from preflight.sandbox import applicable, clone, contract, fixing, inspect as sbx_inspect, onboard, registry, runtime
from preflight.sandbox.registry import RegistryError
from preflight.target import loader
import sandbox_fixtures as fx

URL = "https://github.com/Acme/Tiny-Agent"
SLUG = "acme--tiny-agent"

@pytest.fixture(autouse=True)
def sbx_root(tmp_path, monkeypatch):
    monkeypatch.setenv("PREFLIGHT_SANDBOX_DIR", str(tmp_path / "sbx"))
    for var in ("PREFLIGHT_ALLOW_UNSANDBOXED", "PREFLIGHT_SANDBOX_MAX_MB", "PREFLIGHT_SANDBOX_NETWORK", "PREFLIGHT_SANDBOX_LITELLM_API_KEY"):
        monkeypatch.delenv(var, raising=False)
    return tmp_path / "sbx"

def add(tmp_path, monkeypatch, files, url=URL):
    src = fx.bare_repo(tmp_path, files, name=registry.slug_for(url))
    monkeypatch.setattr(clone, "source_for", lambda u: src)
    return clone.add(url)

def fake_onboarder(files: dict[str, str]):
    def launcher(argv, cwd, log_path, timeout_s):
        fx.write_tree(pathlib.Path(cwd), files)
        return 0
    return launcher

def ready(tmp_path, monkeypatch, files=None):
    e = add(tmp_path, monkeypatch, files or fx.NATIVE)
    return onboard.approve(e.slug)

# ---- 1. URL validation, slug ----
@pytest.mark.parametrize("url", [
    "https://github.com/acme/tiny-agent", "https://github.com/acme/tiny-agent.git", "https://github.com/a/b",
    "https://github.com/Acme-Corp/my_repo.js", "https://github.com/a1/.github".replace(".github", "x.github"),
])
def test_url_accepted(url):
    owner, repo = registry.parse_url(url)
    assert owner and repo and not repo.endswith(".git")

@pytest.mark.parametrize("url", [
    "git@github.com:acme/tiny-agent.git", "ssh://git@github.com/acme/tiny-agent", "http://github.com/acme/tiny-agent",
    "https://gitlab.com/acme/tiny-agent", "https://github.com.evil.io/acme/tiny-agent", "https://evil.io/github.com/acme/repo",
    "https://user:pw@github.com/acme/tiny-agent", "https://github.com/acme/tiny-agent?ref=main", "https://github.com/acme/tiny-agent#x",
    "https://github.com/acme/tiny-agent/tree/main", "https://github.com/acme/tiny-agent/", "https://github.com/acme/../etc",
    "https://github.com/acme/..", "https://github.com/acme/a..b", "https://github.com/../acme/repo", "https://github.com/acme",
    "https://github.com/acme/", "https://github.com/-acme/repo", "https://github.com/acme-/repo", "https://github.com/ac me/repo",
    "https://github.com/acme/repo name", "https://github.com/acme/repo\n", "https://github.com/acme/--upload-pack=x",
    "https://github.com/acme/.git", "file:///etc/passwd", "/tmp/repo", "", "  https://github.com/acme/repo", "https://GITHUB.com/acme/repo",
    "https://github.com/acme/repo;rm -rf", "https://github.com/acme/repo%2f..", None, 7,
])
def test_url_rejected(url):
    with pytest.raises(RegistryError) as e:
        registry.parse_url(url)
    assert e.value.code == "invalid_url"

def test_slug_and_canonical_url():
    assert registry.slug_for(URL) == SLUG
    assert registry.slug_for(URL + ".git") == SLUG
    assert registry.canonical_url(URL + ".git") == URL

# ---- 2. path-escape guards ----
@pytest.mark.parametrize("slug", ["../x", "a/../b", "..", "a..b", "/etc", "a/b", "", "A--B", ".hidden", "a\\b", "a b"])
def test_bad_slug_never_becomes_a_path(slug):
    for fn in (registry.clone_dir, registry.get, registry.remove, lambda s: registry.meta_path(s, ".json")):
        with pytest.raises(RegistryError):
            fn(slug)

def test_meta_path_only_known_suffixes():
    with pytest.raises(RegistryError):
        registry.meta_path(SLUG, "/../../x")

def test_remove_does_not_follow_a_symlink_out_of_the_sandbox(tmp_path):
    outside = tmp_path / "outside"; outside.mkdir(); (outside / "keep.txt").write_text("keep")
    registry.create(URL)
    registry.targets_dir().mkdir(parents=True)
    (registry.targets_dir() / SLUG).symlink_to(outside, target_is_directory=True)
    with pytest.raises(RegistryError):          # resolving the "clone" lands outside the sandbox
        registry.clone_dir(SLUG)
    registry.remove(SLUG)
    assert (outside / "keep.txt").read_text() == "keep"
    assert not (registry.targets_dir() / SLUG).exists() and not registry.list_entries()

def test_by_path_only_matches_a_clone_directory(tmp_path, monkeypatch):
    e = add(tmp_path, monkeypatch, fx.OPENAI_AGENT)
    assert registry.by_path(registry.clone_dir(e.slug)).slug == SLUG
    assert registry.by_path(registry.clone_dir(e.slug) / "agent") is None
    assert registry.by_path(tmp_path) is None and registry.by_path(None) is None

# ---- 3. clone ----
def test_clone_argv_is_inert():
    argv = clone.clone_argv(URL + ".git", pathlib.Path("/x"))
    assert argv[:3] == ["git", "-c", "core.hooksPath=/dev/null"] and argv[3] == "clone"
    for flag in ("--no-recurse-submodules", "--single-branch", "--depth"):
        assert flag in argv
    assert argv[-2:] == [URL, "/x"]
    env = clone.git_env()
    assert env["GIT_TERMINAL_PROMPT"] == "0" and env["GIT_CONFIG_NOSYSTEM"] == "1" and env["GIT_LFS_SKIP_SMUDGE"] == "1"

def test_clone_validates_before_the_seam(tmp_path, monkeypatch):
    monkeypatch.setattr(clone, "source_for", lambda u: pytest.fail("seam reached for an invalid URL"))
    with pytest.raises(RegistryError):
        clone.clone("https://gitlab.com/a/b", tmp_path / "x")
    with pytest.raises(RegistryError):
        clone.add("git@github.com:a/b.git")
    assert not registry.list_entries()

def test_add_clones_inspects_and_records(tmp_path, monkeypatch):
    e = add(tmp_path, monkeypatch, fx.OPENAI_AGENT)
    d = registry.clone_dir(SLUG)
    assert e.status == "cloned" and e.url == URL and len(e.head_sha) == 40 and e.cloned_at
    assert (d / "agent" / "core.py").is_file() and e.stack["frameworks"] == ["openai"] and not e.contract_native
    assert "DISABLED" in clone.safe_git(["remote", "get-url", "--push", "origin"], d).stdout   # nothing can be pushed
    assert not (d / "sandbox").exists() and registry.meta_path(SLUG, ".json").parent == registry.registry_dir()   # entry lives outside the clone
    with pytest.raises(RegistryError) as dup:
        clone.add(URL)
    assert dup.value.code == "already_exists"

def test_size_cap_deletes_the_clone(tmp_path, monkeypatch):
    monkeypatch.setenv("PREFLIGHT_SANDBOX_MAX_MB", "0.001")
    with pytest.raises(RegistryError) as e:
        add(tmp_path, monkeypatch, {**fx.OPENAI_AGENT, "big.bin": "x" * 50_000})
    assert e.value.code == "too_large"
    assert not (registry.targets_dir() / SLUG).exists() and not registry.list_entries()

def test_failed_clone_leaves_nothing(tmp_path, monkeypatch):
    monkeypatch.setattr(clone, "source_for", lambda u: f"file://{tmp_path}/does-not-exist.git")
    with pytest.raises(RegistryError) as e:
        clone.add(URL)
    assert e.value.code == "clone_failed" and not registry.list_entries() and not (registry.targets_dir() / SLUG).exists()

# ---- 4. inspect (static) ----
def test_inspect_python_openai_agent(tmp_path):
    s = sbx_inspect.inspect(fx.write_tree(tmp_path / "r", fx.OPENAI_AGENT))
    assert s["languages"] == ["python"] and s["package_manager"] == "pip"
    assert s["frameworks"] == ["openai"] and "fastapi" in s["servers"] and s["is_agent_candidate"]
    assert s["entry_points"][0] == {"path": "agent/server.py", "kind": "http_app", "detail": "FastAPI"}
    assert {"path": "main.py", "kind": "main"} in s["entry_points"]
    assert s["env_vars"] == ["OPENAI_API_KEY", "SEARCH_BASE_URL"] and s["has_tests"] and not s["contract_native"]

def test_inspect_langchain_agent(tmp_path):
    s = sbx_inspect.inspect(fx.write_tree(tmp_path / "r", fx.LANGCHAIN_AGENT))
    assert s["frameworks"] == ["langchain", "langgraph"] and s["servers"] == ["flask"] and s["is_agent_candidate"]
    assert s["entry_points"][0]["path"] == "bot.py"

def test_inspect_agent_without_an_sdk(tmp_path):
    s = sbx_inspect.inspect(fx.write_tree(tmp_path / "r", {"requirements.txt": "httpx>=0.27\n",
                                                             "a.py": 'import httpx\nhttpx.post(BASE + "/chat/completions", json={})\n'}))
    assert s["frameworks"] == ["llm-http"] and s["is_agent_candidate"] and s["dependency_count"] == 1

def test_inspect_non_agent_repo(tmp_path):
    s = sbx_inspect.inspect(fx.write_tree(tmp_path / "r", fx.NON_AGENT))
    assert s["languages"] == ["javascript"] and s["package_manager"] == "npm"
    assert s["frameworks"] == [] and not s["is_agent_candidate"] and s["servers"] == ["express"]
    assert any(e["kind"] == "script" for e in s["entry_points"])

def test_inspect_contract_native_repo(tmp_path):
    s = sbx_inspect.inspect(fx.write_tree(tmp_path / "r", fx.NATIVE))
    assert s["contract_native"] and s["has_adapter"]

def test_inspect_does_not_follow_symlinks(tmp_path):
    secret = tmp_path / "secret.py"; secret.write_text("import anthropic\n")
    root = fx.write_tree(tmp_path / "r", {"a.py": "x = 1\n"})
    (root / "link.py").symlink_to(secret)
    (root / ".env.example").symlink_to(secret)
    s = sbx_inspect.inspect(root)
    assert s["frameworks"] == [] and s["env_vars"] == []

# ---- 5. status transitions and the approval gate ----
def test_only_approve_reaches_ready(tmp_path, monkeypatch):
    e = add(tmp_path, monkeypatch, fx.OPENAI_AGENT)
    with pytest.raises(RegistryError):
        registry.set_status(e.slug, "ready")                 # cloned -> ready is not a transition
    with pytest.raises(RegistryError):
        registry.update(e.slug, status="ready")              # and not a plain field
    with pytest.raises(RegistryError) as ex:
        onboard.approve(e.slug)                              # nothing to approve yet
    assert ex.value.code == "invalid_state"
    with pytest.raises(RegistryError) as ex:
        runtime.start(e.slug)
    assert ex.value.code == "not_approved"

def test_contract_native_repo_still_needs_a_human(tmp_path, monkeypatch):
    e = add(tmp_path, monkeypatch, fx.NATIVE)
    assert e.status == "needs_review" and e.contract_native and e.manifest_path.endswith("preflight.yaml")
    with pytest.raises(RegistryError) as ex:
        runtime.require_ready(e)
    assert ex.value.code == "not_approved"
    with pytest.raises(RegistryError):
        onboard.run(e.slug)                                  # nothing to generate
    e = onboard.approve(e.slug)
    assert e.status == "ready" and e.approved_fingerprint and e.approved_at
    runtime.require_ready(e)

def test_files_changed_after_approval_revoke_it(tmp_path, monkeypatch):
    e = ready(tmp_path, monkeypatch)
    (registry.clone_dir(e.slug) / "preflight_adapter.py").write_text("import os; os.system('id')\n")
    with pytest.raises(RegistryError) as ex:
        runtime.start(e.slug)
    assert ex.value.code == "not_approved" and registry.get(e.slug).status == "needs_review"

# ---- 6. manifest rules (third-party manifests are never trusted) ----
def test_manifest_check_accepts_the_contract_shape(tmp_path):
    spec, problems = contract.check(fx.write_tree(tmp_path / "r", fx.NATIVE), {"PORT": "4321", "PREFLIGHT_OWNERSHIP_TOKEN": "tok"})
    assert problems == [] and spec.entry.chat_endpoint == "http://localhost:4321/chat" and spec.ownership_token == "tok"

@pytest.mark.parametrize("old,new,needle", [
    ("http://localhost:${PORT}/chat", "http://169.254.169.254/chat", "chat_endpoint"),
    ("http://localhost:${PORT}/health", "http://localhost:8200/health", "healthcheck"),
    ('"${PREFLIGHT_OWNERSHIP_TOKEN}"', "hardcoded", "ownership_token"),
    ("python preflight_adapter.py", "python preflight_adapter.py ${LITELLM_API_KEY}", "placeholders"),
    ("repo: .", "repo: ../..", "repo must be"),
    ("agent/core.py:answer", "../../etc/passwd:x", "source"),
    ("SEARCH_BASE_URL", "LD_PRELOAD", "upstream_env"),
    ("editable_paths: [agent/]", "editable_paths: [../]", "leaves the repository"),
])
def test_manifest_check_rejects(tmp_path, old, new, needle):
    assert old in fx.MANIFEST
    root = fx.write_tree(tmp_path / "r", {**fx.NATIVE, "preflight.yaml": fx.MANIFEST.replace(old, new)})
    _, problems = contract.check(root)
    assert any(needle in p for p in problems), problems

def test_sandbox_manifest_cannot_read_host_environment(tmp_path, monkeypatch):
    monkeypatch.setenv("HOST_SECRET", "s3cret")
    root = fx.write_tree(tmp_path / "r", {"preflight.yaml": fx.MANIFEST.replace("python preflight_adapter.py", "run ${HOST_SECRET} ${PORT}")})
    assert loader.load(root, env={"PORT": "1"}, env_only=True).entry.start == "run  1"
    assert loader.load(root, env={"PORT": "1"}).entry.start == "run s3cret 1"      # built-in targets keep the old behaviour

# ---- 7. onboarder (the claude session is replaced by a function that writes files) ----
def test_onboarder_command_has_no_way_to_execute():
    argv = onboard.command("brief", 40)
    assert argv[:2] == ["claude", "-p"] and "--restricted" in argv and "--safe-mode" in argv and "--strict-mcp-config" in argv
    assert argv[argv.index("--permission-mode") + 1] == "acceptEdits" and argv[argv.index("--output-format") + 1] == "json"
    for flag in ("--tools", "--allowedTools"):
        tools = argv[argv.index(flag) + 1]
        assert tools == "Read,Edit,Write,Glob,Grep,LS" and "Bash" not in tools and "Web" not in tools
    assert "bypassPermissions" not in argv and "--dangerously-skip-permissions" not in argv

def test_onboarder_env_drops_secrets(monkeypatch):
    monkeypatch.setenv("LITELLM_API_KEY", "k"); monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "k"); monkeypatch.setenv("CLAUDE_CODE_OAUTH_TOKEN", "t")
    env = onboard.session_env()
    assert "LITELLM_API_KEY" not in env and "AWS_SECRET_ACCESS_KEY" not in env and env["CLAUDE_CODE_OAUTH_TOKEN"] == "t" and "PATH" in env

def test_onboard_success_parks_in_needs_review(tmp_path, monkeypatch):
    e = add(tmp_path, monkeypatch, fx.OPENAI_AGENT)
    seen = {}
    def launcher(argv, cwd, log_path, timeout_s):
        seen.update(argv=argv, cwd=pathlib.Path(cwd), status=registry.get(e.slug).status)
        return fake_onboarder({"preflight.yaml": fx.MANIFEST, "preflight_adapter.py": fx.ADAPTER})(argv, cwd, log_path, timeout_s)
    e = onboard.run(e.slug, launcher=launcher)
    assert seen["cwd"] == registry.clone_dir(SLUG) and seen["status"] == "onboarding"
    prompt = seen["argv"][2]
    for needle in ("X-Preflight-Run-Id", "upstream_attempt", '"component": "agent"', "PREFLIGHT_UNSUPPORTED.md", "${PREFLIGHT_OWNERSHIP_TOKEN}",
                   "LITELLM_BASE_URL", "http://localhost:${PORT}/chat", "untrusted data", '"frameworks"'):
        assert needle in prompt, needle
    assert e.status == "needs_review" and e.manifest_path                       # never auto-ready
    patch = registry.read_meta(SLUG, ".onboard.patch")
    assert "+++ b/preflight_adapter.py" in patch and "+app = FastAPI()" in patch and "+++ b/preflight.yaml" in patch
    assert registry.read_meta(SLUG, ".brief.md") in prompt
    with pytest.raises(RegistryError):
        runtime.require_ready(e)
    assert onboard.approve(SLUG).status == "ready"

def test_onboard_unsupported(tmp_path, monkeypatch):
    e = add(tmp_path, monkeypatch, fx.NON_AGENT)
    e = onboard.run(e.slug, launcher=fake_onboarder({"PREFLIGHT_UNSUPPORTED.md": "Not an LLM agent: a static Express site."}))
    assert e.status == "unsupported" and "Express" in e.last_error
    with pytest.raises(RegistryError):
        onboard.approve(e.slug)

def test_onboard_invalid_manifest_is_an_error_with_the_patch_kept(tmp_path, monkeypatch):
    e = add(tmp_path, monkeypatch, fx.OPENAI_AGENT)
    bad = fx.MANIFEST.replace("http://localhost:${PORT}/chat", "http://attacker.example/chat")
    e = onboard.run(e.slug, launcher=fake_onboarder({"preflight.yaml": bad, "preflight_adapter.py": fx.ADAPTER}))
    assert e.status == "error" and e.error_code == "invalid_manifest" and "chat_endpoint" in e.last_error
    assert "attacker.example" in registry.read_meta(SLUG, ".onboard.patch")
    e = onboard.run(e.slug, launcher=fake_onboarder({"preflight.yaml": fx.MANIFEST}))    # retry is allowed from error
    assert e.status == "needs_review"

def test_onboard_without_adapter_or_files_is_an_error(tmp_path, monkeypatch):
    e = add(tmp_path, monkeypatch, fx.OPENAI_AGENT)
    assert onboard.run(e.slug, launcher=fake_onboarder({})).status == "error"
    e = onboard.run(e.slug, launcher=fake_onboarder({"preflight.yaml": fx.MANIFEST}))
    assert e.status == "error" and "preflight_adapter.py" in e.last_error

def test_onboard_detects_git_tampering(tmp_path, monkeypatch):
    e = add(tmp_path, monkeypatch, fx.OPENAI_AGENT)
    e = onboard.run(e.slug, launcher=fake_onboarder({"preflight.yaml": fx.MANIFEST, "preflight_adapter.py": fx.ADAPTER,
                                                     ".git/hooks/post-checkout": "#!/bin/sh\nid\n"}))
    assert e.status == "error" and e.error_code == "tampered"

def test_onboard_missing_claude_cli(tmp_path, monkeypatch):
    e = add(tmp_path, monkeypatch, fx.OPENAI_AGENT)
    def launcher(*a):
        raise FileNotFoundError("claude")
    e = onboard.run(e.slug, launcher=launcher)
    assert e.status == "error" and e.error_code == "onboarder_unavailable"

# ---- 8. runtime: Docker or nothing ----
def test_runtime_refuses_without_docker_unless_trusted_and_env(tmp_path, monkeypatch):
    e = ready(tmp_path, monkeypatch)
    monkeypatch.setattr(runtime, "docker_available", lambda refresh=False: False)
    with pytest.raises(RegistryError) as ex:
        runtime.start(e.slug)
    assert ex.value.code == "docker_unavailable" and "Docker" in str(ex.value)
    monkeypatch.setenv("PREFLIGHT_ALLOW_UNSANDBOXED", "1")                 # env alone is not enough
    with pytest.raises(RegistryError):
        runtime.choose_mode(registry.get(e.slug))
    monkeypatch.delenv("PREFLIGHT_ALLOW_UNSANDBOXED")
    e = registry.update(e.slug, trusted=True)                              # trusted alone is not enough
    with pytest.raises(RegistryError):
        runtime.choose_mode(e)
    monkeypatch.setenv("PREFLIGHT_ALLOW_UNSANDBOXED", "1")
    assert runtime.choose_mode(e) == "process"
    monkeypatch.setattr(runtime, "docker_available", lambda refresh=False: True)
    assert runtime.choose_mode(e) == "docker"                              # Docker always wins when present

def test_trusted_fallback_uses_the_manifest_start_command_with_a_closed_env(tmp_path, monkeypatch):
    e = registry.update(ready(tmp_path, monkeypatch).slug, trusted=True)
    monkeypatch.setattr(runtime, "docker_available", lambda refresh=False: False)
    monkeypatch.setenv("PREFLIGHT_ALLOW_UNSANDBOXED", "1"); monkeypatch.setenv("CRUSTDATA_API_KEY", "host-secret")
    seen = {}
    monkeypatch.setattr(runtime.process, "ensure_running", lambda comp, log_path=None, env=None: seen.update(comp=comp, env=env))
    r = runtime.start(e.slug)
    assert r.mode == "process" and seen["comp"].start == "python preflight_adapter.py" and seen["comp"].repo_path == registry.clone_dir(e.slug)
    assert seen["env"]["PORT"] == str(r.port) and seen["env"]["HOST"] == "127.0.0.1" and "CRUSTDATA_API_KEY" not in seen["env"]
    assert r.spec.entry.chat_endpoint == f"http://localhost:{r.port}/chat"

def test_docker_run_argv_is_hardened():
    argv = runtime.run_argv("preflight-sbx-a--b", "preflight-sbx-a--b", 4321, ["PORT", "LITELLM_API_KEY"], "python preflight_adapter.py")
    s = " ".join(argv)
    assert argv[:4] == ["docker", "run", "-d", "--rm"]
    for flags in ("--memory 1g", "--cpus 1", "--pids-limit 256", "--cap-drop ALL", "--security-opt no-new-privileges",
                  "--network bridge", "--add-host host.docker.internal:host-gateway", "-p 127.0.0.1:4321:4321"):
        assert flags in s, flags
    for forbidden in ("-v", "--volume", "--mount", "--privileged", "--pid", "--cap-add", "host"):
        assert forbidden not in argv
    assert "0.0.0.0" not in s
    assert argv[-5:] == ["--entrypoint", "sh", "preflight-sbx-a--b", "-c", "python preflight_adapter.py"]
    envs = [argv[i + 1] for i, a in enumerate(argv) if a == "-e"]
    assert envs == ["LITELLM_API_KEY", "PORT"] and not any("=" in v for v in envs)     # by name: no secret in the process list

def test_target_env_is_a_closed_list(tmp_path, monkeypatch):
    monkeypatch.setenv("LITELLM_BASE_URL", "http://localhost:4000/v1"); monkeypatch.setenv("LITELLM_API_KEY", "main-key")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "nope"); monkeypatch.setenv("CRUSTDATA_API_KEY", "nope"); monkeypatch.setenv("TARGET_MODEL", "m")
    spec, _ = contract.check(fx.write_tree(tmp_path / "r", fx.NATIVE))
    env = runtime.target_env(spec, 4321, "tok", in_container=True)
    assert set(env) == {"PORT", "HOST", "PREFLIGHT_OWNERSHIP_TOKEN", "PREFLIGHT_MIRROR_DIR", "LITELLM_BASE_URL", "LITELLM_API_KEY", "TARGET_MODEL", "SEARCH_BASE_URL"}
    assert env["LITELLM_BASE_URL"] == "http://host.docker.internal:4000/v1" and env["SEARCH_BASE_URL"] == "http://host.docker.internal:8300"
    assert env["HOST"] == "0.0.0.0" and env["LITELLM_API_KEY"] == "main-key"
    monkeypatch.setenv("PREFLIGHT_SANDBOX_LITELLM_API_KEY", "scoped-key")
    assert runtime.target_env(spec, 4321, "tok", in_container=True)["LITELLM_API_KEY"] == "scoped-key"

def test_generated_dockerfile_stays_outside_the_clone(tmp_path, monkeypatch):
    e = ready(tmp_path, monkeypatch)
    d = registry.clone_dir(e.slug)
    path, generated = runtime.dockerfile_for(e.slug, d)
    assert generated and path.parent == registry.registry_dir() and "python:3.12-slim" in path.read_text() and "USER sbx" in path.read_text()
    assert not (d / "Dockerfile").exists() and contract.fingerprint(d) == e.approved_fingerprint
    assert runtime.build_argv("img", path, d) == ["docker", "build", "-q", "-f", str(path), "-t", "img", str(d)]
    node = fx.write_tree(tmp_path / "node", fx.NON_AGENT)
    assert "node:22" in runtime.dockerfile_for(e.slug, node)[0].read_text()
    (d / "Dockerfile").write_text("FROM scratch\n")
    assert runtime.dockerfile_for(e.slug, d) == (d / "Dockerfile", False)

def test_resolve_gives_each_target_its_own_token_and_a_sticky_port(tmp_path, monkeypatch):
    a = ready(tmp_path, monkeypatch)
    b = add(tmp_path, monkeypatch, fx.NATIVE, url="https://github.com/other/agent")
    ea, eb = runtime.resolve(a.slug), runtime.resolve(b.slug)
    assert ea["PREFLIGHT_OWNERSHIP_TOKEN"] != eb["PREFLIGHT_OWNERSHIP_TOKEN"] and len(ea["PREFLIGHT_OWNERSHIP_TOKEN"]) >= 24
    assert runtime.resolve(a.slug) == ea
    assert oct(registry.meta_path(a.slug, ".runtime.json").stat().st_mode)[-3:] == "600"
    assert runtime.status(a.slug)["running"] is False

# ---- 9. applicability ----
def _attack(id: str, family: str, **kw) -> AttackSpec:
    return AttackSpec(id=id, family=family, name=id, description="d", safe_behavior="s", graders=["canary"], **kw)

def test_applicability_follows_the_manifest(tmp_path):
    attacks = [_attack(f"{f}1", f) for f in "ABCDEFGH"] + [_attack("X1", "A", applies_when=["tool:send_email"]), _attack("X2", "D", applies_when=["tools"])]
    bare, _ = contract.check(fx.write_tree(tmp_path / "bare", {**fx.NATIVE, "preflight.yaml": fx.MANIFEST.split("    tools:")[0]}))
    selected, skipped = applicable.select(attacks, bare)
    assert [a.id for a in selected] == ["A1", "B1", "C1", "H1"]
    reasons = {a.id: why for a, why in skipped}
    assert set(reasons) == {"D1", "E1", "F1", "G1", "X1", "X2"} and "kind: sql" in reasons["E1"] and "high_impact" in reasons["G1"]
    assert "canaries_file" in reasons["F1"] and "tool:send_email" in reasons["X1"]

    full = fx.MANIFEST.replace("    tools:\n", "    canaries_file: canaries.json\n    tools:\n      crm: {kind: sql}\n      send_email: {high_impact: true}\n")
    spec, _ = contract.check(fx.write_tree(tmp_path / "full", {**fx.NATIVE, "preflight.yaml": full, "canaries.json": "{}"}))
    selected, skipped = applicable.select(attacks, spec)
    assert [a.id for a in selected] == [a.id for a in attacks] and skipped == []

def test_real_catalog_on_a_tool_less_agent(tmp_path):
    from preflight.attacks import catalog
    spec, _ = contract.check(fx.write_tree(tmp_path / "bare", {**fx.NATIVE, "preflight.yaml": fx.MANIFEST.split("    tools:")[0]}))
    selected, skipped = applicable.select(catalog.select(catalog.load_all(), "P0"), spec)
    assert {a.family for a in selected} == {"A", "B", "C", "H"} and {a.family for a, _ in skipped} == {"D", "E", "F", "G"}

# ---- 10. the existing run path ----
def test_coordinator_treats_a_sandbox_target_as_find_only(tmp_path, monkeypatch):
    from preflight.coordinator import Coordinator
    e = ready(tmp_path, monkeypatch)
    c = Coordinator(registry.clone_dir(e.slug), mode="dev")
    env = runtime.resolve(e.slug)
    assert c.sandbox.slug == e.slug and c.no_fix is True and c.allow_fix is False
    assert c.spec.entry.chat_endpoint == f"http://localhost:{env['PORT']}/chat" and c.spec.ownership_token == env["PREFLIGHT_OWNERSHIP_TOKEN"]
    c.guard.check_url(c.spec.entry.chat_endpoint)                              # localhost: inside the existing allowlist
    assert Coordinator(registry.clone_dir(e.slug), allow_fix=True).no_fix is False

def test_run_refuses_an_unapproved_sandbox_target_and_records_why(tmp_path, monkeypatch):
    from preflight import coordinator as coord
    e = add(tmp_path, monkeypatch, fx.NATIVE)                                  # needs_review, not approved
    monkeypatch.setattr(coord, "ensure_proxy", lambda: None)
    c = coord.Coordinator(registry.clone_dir(e.slug))
    with pytest.raises(RegistryError) as ex:
        c.run()
    assert ex.value.code == "not_approved" and c.ledger.manifest()["state"] == "STOPPED" and c.ledger.manifest()["error_code"] == "not_approved"

def test_builtin_style_target_is_untouched(tmp_path):
    from preflight.coordinator import Coordinator
    root = fx.write_tree(tmp_path / "plain", {"preflight.yaml": fx.MANIFEST.replace("${PORT}", "8100")})
    c = Coordinator(root, no_fix=False)
    assert c.sandbox is None and c.no_fix is False and c.spec.entry.chat_endpoint == "http://localhost:8100/chat"

# ---- 11. opt-in fixing ----
def test_allow_fix_needs_a_trusted_target_and_stays_local(tmp_path, monkeypatch):
    e = add(tmp_path, monkeypatch, fx.OPENAI_AGENT)
    onboard.run(e.slug, launcher=fake_onboarder({"preflight.yaml": fx.MANIFEST, "preflight_adapter.py": fx.ADAPTER}))
    e = onboard.approve(e.slug)
    with pytest.raises(RegistryError) as ex:
        fixing.prepare(e.slug)
    assert ex.value.code == "fix_requires_trust"
    registry.update(e.slug, trusted=True)
    e = fixing.prepare(e.slug)
    d = registry.clone_dir(e.slug)
    assert e.fix_base_sha and e.fix_base_sha != e.head_sha
    assert clone.safe_git(["rev-parse", "--abbrev-ref", "HEAD"], d).stdout.strip() == "main"
    assert "preflight_adapter.py" in clone.safe_git(["ls-files"], d).stdout
    runtime.require_ready(registry.get(e.slug))                                # the approval followed the reviewed content into the commit
    assert fixing.prepare(e.slug).fix_base_sha == e.fix_base_sha               # idempotent
    (d / "agent" / "core.py").write_text("# fixed\n")
    clone.safe_git(["add", "-A"], d); clone.safe_git([*fixing.IDENT, "commit", "-q", "-m", "fix"], d)
    patch = fixing.export_patch(e.slug)
    assert patch.parent == registry.registry_dir() and "+# fixed" in patch.read_text()
    assert clone.safe_git(["push", "origin", "main"], d).returncode != 0       # push URL was disabled at clone time
