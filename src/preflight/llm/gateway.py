"""Model gateway: every Preflight LLM call goes through here (LiteLLM, OpenAI-compatible), traced by neatlogs."""
from __future__ import annotations
import json, os, time
from dataclasses import dataclass
from typing import Any, Callable
from .. import config

_inited = False
def init_tracing() -> None:
    global _inited
    if _inited:
        return
    import neatlogs
    neatlogs.init(api_key=os.getenv("NEATLOGS_API_KEY"), workflow_name=config.CFG.neatlogs.get("preflight_workflow", "preflight"),
                  tags=["preflight"])
    import atexit
    atexit.register(_flush_quietly)   # the CLI exits right after the last LLM call; without this the exporter drops the tail
    _inited = True

def _flush_quietly() -> None:
    try:
        import neatlogs
        neatlogs.flush()
    except Exception:
        pass

@dataclass
class Completion:
    text: str
    model: str
    input_tokens: int
    output_tokens: int
    usd: float
    duration_ms: int

class Gateway:
    def __init__(self, on_spend: Callable[[float, str], None] | None = None, log_path=None):
        init_tracing()
        import neatlogs
        from openai import OpenAI
        self.client = neatlogs.wrap(OpenAI(base_url=config.env("LITELLM_BASE_URL", "https://litellm.vision.aivar.app/v1"),
                                           api_key=config.env("LITELLM_API_KEY")))
        self.on_spend = on_spend
        self.log_path = log_path
        self.available = self._models()
        self.tiers = {tier: self._pick(prefs) for tier, prefs in
                      (("cheap", config.CFG.models.cheap), ("strong", config.CFG.models.strong))}

    def _models(self) -> list[str]:
        try:
            return [m.id for m in self.client.models.list().data]
        except Exception:
            return list(config.CFG.models.prices_per_1m)

    def _pick(self, prefs: list[str]) -> str:
        for p in prefs:
            if p in self.available:
                return p
        return self.available[0] if self.available else prefs[0]

    def cost(self, model: str, inp: int, out: int) -> float:
        pin, pout = config.CFG.models.prices_per_1m.get(model, [3.0, 15.0])
        return (inp * pin + out * pout) / 1_000_000

    def complete(self, role: str, messages: list[dict], *, tier: str = "cheap", temperature: float = 0.3,
                 max_tokens: int = 600, json_mode: bool = False) -> Completion:
        model = self.tiers.get(tier, self.tiers["cheap"])
        t0 = time.time()
        kw: dict[str, Any] = {}
        if json_mode:
            kw["response_format"] = {"type": "json_object"}
        resp = self.client.chat.completions.create(model=model, messages=messages, temperature=temperature, max_tokens=max_tokens, **kw)
        u = resp.usage
        c = Completion(text=resp.choices[0].message.content or "", model=model, input_tokens=u.prompt_tokens if u else 0,
                       output_tokens=u.completion_tokens if u else 0, usd=0.0, duration_ms=int((time.time() - t0) * 1000))
        c.usd = self.cost(model, c.input_tokens, c.output_tokens)
        if self.on_spend:
            self.on_spend(c.usd, role)
        if self.log_path:
            with open(self.log_path, "a") as f:
                f.write(json.dumps({"ts": time.time(), "role": role, "model": model, "messages": messages, "response": c.text,
                                    "usd": c.usd, "tokens": [c.input_tokens, c.output_tokens]}, default=str) + "\n")
        return c

def parse_json(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        text = text.split("\n", 1)[1] if "\n" in text else text
    start, end = text.find("{"), text.rfind("}")
    return json.loads(text[start:end + 1]) if start >= 0 else {}
