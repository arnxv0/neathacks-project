"""Demo reset: target back on the unfixed tag, ledger and regression suite archived (never deleted)."""
import subprocess
import pytest
from preflight import config, demo

def git(repo, *args):
    subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@t", *args], cwd=repo, check=True, capture_output=True)

@pytest.fixture
def world(tmp_path, monkeypatch):
    target = tmp_path / "target"; target.mkdir()
    git(target, "init", "-q", "-b", "main")
    (target / "app.py").write_text("v0\n"); git(target, "add", "-A"); git(target, "commit", "-qm", "v0"); git(target, "tag", demo.UNFIXED_TAG)
    git(target, "checkout", "-q", "-b", "fix/d1-x"); (target / "app.py").write_text("fixed\n"); git(target, "commit", "-qam", "fix")
    git(target, "checkout", "-q", "main"); git(target, "merge", "-q", "--no-ff", "fix/d1-x", "-m", "merge")
    ledger = tmp_path / "ledger"; (ledger / "20261011-000000-aaaa").mkdir(parents=True); (ledger / "20261011-000000-aaaa" / "manifest.json").write_text("{}")
    (ledger / ".gitkeep").write_text(""); (ledger / "preflight.sqlite").write_text("x")
    regs = tmp_path / "regressions"; regs.mkdir(); (regs / "d1-x.yaml").write_text("id: d1-x\n")
    monkeypatch.setattr(config, "LEDGER_DIR", ledger); monkeypatch.setattr(config, "REGRESSIONS_DIR", regs)
    monkeypatch.setattr(config, "ROOT", tmp_path); monkeypatch.setattr(demo, "ARCHIVE_DIR", tmp_path / "ledger-archive")
    monkeypatch.setattr(demo, "_recycle_target", lambda t, port: "not running")
    return target, ledger, regs, tmp_path

def test_reset_rewinds_target_and_archives(world):
    target, ledger, regs, root = world
    (root / "STOP").write_text("stop")
    out = demo.reset(target)
    assert (target / "app.py").read_text() == "v0\n"
    assert subprocess.check_output(["git", "branch", "--list", "fix/*"], cwd=target, text=True).strip() == ""
    assert out["fix_branches_removed"] == 1 and out["assessments_archived"] == 1 and out["regression_suites_archived"] == 1
    assert [p.name for p in ledger.iterdir()] == [".gitkeep"] and not list(regs.glob("*.yaml")) and not (root / "STOP").exists()
    archive = next((root / "ledger-archive").iterdir())
    assert (archive / "ledger" / "20261011-000000-aaaa" / "manifest.json").exists() and (archive / "regressions" / "d1-x.yaml").exists()

def test_reset_twice_is_a_no_op(world):
    target, *_ = world
    demo.reset(target)
    out = demo.reset(target)
    assert out["archive"] is None and out["assessments_archived"] == 0

def test_reset_refuses_a_target_without_the_tag(tmp_path):
    (tmp_path / "x").mkdir()
    assert not demo.available(tmp_path / "x")
    with pytest.raises(demo.ResetError):
        demo.reset(tmp_path / "x")
