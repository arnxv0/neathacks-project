"""Settings: config.yaml + .env."""
from __future__ import annotations
import os, pathlib, yaml
from dotenv import load_dotenv
from pydantic import BaseModel

ROOT = pathlib.Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")

class ModeCfg(BaseModel):
    seeds_per_attack: int = 1
    replay_k: int = 2
    max_usd: float = 1.0
    concurrency: int = 3
    attacks: str = "P0"

class GuardCfg(BaseModel):
    allowlist: list[str] = ["localhost", "127.0.0.1"]
    rps: float = 4
    run_timeout_s: int = 120
    assessment_timeout_s: int = 1500

class ModelsCfg(BaseModel):
    cheap: list[str] = ["claude-haiku"]
    strong: list[str] = ["claude-sonnet-4.6"]
    prices_per_1m: dict[str, list[float]] = {}

class Config(BaseModel):
    modes: dict[str, ModeCfg]
    guard: GuardCfg = GuardCfg()
    models: ModelsCfg = ModelsCfg()
    ports: dict[str, int] = {}
    fixers: dict[str, int] = {"max_parallel": 3, "max_retries": 2, "max_turns": 60}
    neatlogs: dict[str, str] = {}

def load(path: pathlib.Path | None = None) -> Config:
    p = path or ROOT / "config.yaml"
    return Config.model_validate(yaml.safe_load(p.read_text()))

CFG = load()
LEDGER_DIR = pathlib.Path(os.getenv("PREFLIGHT_LEDGER_DIR", ROOT / "ledger"))
OUT_DIR = ROOT / "out"
ATTACKS_DIR = ROOT / "attacks"
FIXTURES_DIR = ROOT / "fixtures"
REGRESSIONS_DIR = pathlib.Path(os.getenv("PREFLIGHT_REGRESSIONS_DIR", ROOT / "regressions"))

def env(name: str, default: str = "") -> str:
    return os.getenv(name, default)
