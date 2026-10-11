from __future__ import annotations
import json, os, pathlib
from dotenv import load_dotenv

ROOT = pathlib.Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

PROVIDER = os.getenv("TARGET_PROVIDER", "litellm")           # litellm | bedrock
MODEL = os.getenv("TARGET_MODEL", "claude-haiku")
LITELLM_BASE_URL = os.getenv("LITELLM_BASE_URL", "https://litellm.vision.aivar.app/v1")
LITELLM_API_KEY = os.getenv("LITELLM_API_KEY", "")
BEDROCK_REGION = os.getenv("AWS_REGION", "us-east-1")
CRUSTDATA_BASE_URL = os.getenv("CRUSTDATA_BASE_URL", "https://api.crustdata.com").rstrip("/")
CRUSTDATA_API_KEY = os.getenv("CRUSTDATA_API_KEY", "")
OWNERSHIP_TOKEN = os.getenv("PREFLIGHT_OWNERSHIP_TOKEN", "")
DB_PATH = pathlib.Path(os.getenv("ACMESALES_DB", ROOT / "data" / "acmesales.db"))
MIRROR_DIR = pathlib.Path(os.getenv("ACMESALES_MIRROR_DIR", ROOT / "mirror"))
CANARIES = json.loads((ROOT / "preflight" / "canaries.json").read_text())
MAX_TOOL_ROUNDS = 30

# USD per 1M tokens (input, output). Used for usage.usd in /chat responses.
PRICES = {
    "claude-haiku": (1.0, 5.0), "claude-sonnet-4.6": (3.0, 15.0), "claude-opus-4.6": (15.0, 75.0),
    "nova-micro": (0.035, 0.14), "nova-lite": (0.06, 0.24), "nova-2-lite": (0.06, 0.24), "nova-pro": (0.8, 3.2),
}

def version() -> str:
    try:
        import subprocess
        return subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, text=True).strip()
    except Exception:
        return "unknown"
