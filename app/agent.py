"""The AcmeSales tool-calling loop."""
from __future__ import annotations
import datetime as dt
import json, time
from dataclasses import dataclass, field
import neatlogs
from . import config, llm, mirror
from .context import get_context
from .tools import SCHEMAS, dispatch

TENANT_NAMES = {"tenant_a": "Northwind Software", "tenant_b": "Contoso Cloud"}
USER_NAMES = {"rep": "Alex Rivera", "manager": "Jordan Blake"}

def system_prompt(tenant_id: str, user_role: str) -> str:
    tpl = (config.ROOT / "prompts" / "system.md").read_text()
    return (tpl.replace("{{tenant_name}}", TENANT_NAMES.get(tenant_id, tenant_id))
               .replace("{{tenant_id}}", tenant_id)
               .replace("{{user_role}}", user_role)
               .replace("{{user_name}}", USER_NAMES.get(user_role, "Alex Rivera"))
               .replace("{{today}}", dt.date.today().isoformat())
               .replace("{{system_canary}}", config.CANARIES["system_prompt"]))

@dataclass
class TurnResult:
    reply: str
    tool_calls: list[dict] = field(default_factory=list)
    steps: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    usd: float = 0.0

EMPTY_MESSAGE_REPLY = ("I didn't receive any message content. What can I help you with? I can research a prospect, "
                       "review account history, issue a goodwill credit, log activity or draft an email.")

def run_turn(history: list[dict], user_message: str) -> TurnResult:
    """history: provider-neutral OpenAI-style messages (without system). Mutated in place."""
    ctx = get_context()
    if not isinstance(user_message, str):
        user_message = "" if user_message is None else str(user_message)
    if not user_message.strip():
        # Model providers reject empty / whitespace-only text blocks, which would surface as an unhandled 500.
        # Answer directly and keep the blank turn out of history so later turns in this session still work.
        mirror.record("user_message", content=user_message)
        result = TurnResult(reply=EMPTY_MESSAGE_REPLY)
        mirror.record("reply", content=result.reply, steps=0, usd=0.0, input_tokens=0, output_tokens=0)
        return result
    messages = [{"role": "system", "content": system_prompt(ctx.tenant_id, ctx.user_role)}] + history
    messages.append({"role": "user", "content": user_message})
    history.append({"role": "user", "content": user_message})
    mirror.record("user_message", content=user_message)
    result = TurnResult(reply="")
    for round_no in range(config.MAX_TOOL_ROUNDS):
        t0 = time.time()
        out = llm.chat(messages, SCHEMAS)
        usd = llm.cost_usd(config.MODEL, out.input_tokens, out.output_tokens)
        result.input_tokens += out.input_tokens; result.output_tokens += out.output_tokens; result.usd += usd
        result.steps += 1
        mirror.record("llm_call", model=config.MODEL, input_tokens=out.input_tokens, output_tokens=out.output_tokens, usd=usd,
                      duration_ms=int((time.time() - t0) * 1000), tool_calls=[{"name": c.name, "args": c.arguments} for c in out.tool_calls],
                      content=(out.content or "")[:2000])
        messages.append(out.raw_assistant_message); history.append(out.raw_assistant_message)
        if not out.tool_calls:
            result.reply = out.content or ""
            break
        for call in out.tool_calls:
            t1 = time.time()
            try:
                tool_out = dispatch(call.name, call.arguments)
            except TypeError as e:
                tool_out = f"error: bad arguments for {call.name}: {e}"
            except Exception as e:  # keep the loop alive; the model sees the error
                tool_out = f"error: {type(e).__name__}: {e}"
            result.steps += 1
            result.tool_calls.append({"name": call.name, "args": call.arguments, "result": tool_out[:4000]})
            mirror.record("tool_call", tool=call.name, args=call.arguments, result=tool_out[:4000],
                          duration_ms=int((time.time() - t1) * 1000))
            tool_msg = {"role": "tool", "tool_call_id": call.id, "content": tool_out}
            messages.append(tool_msg); history.append(tool_msg)
    else:
        result.reply = "I hit my internal step limit while working on this. Here is where I got to: " + \
                       (out.content or "see the actions above.")
    mirror.record("reply", content=result.reply[:4000], steps=result.steps, usd=result.usd,
                  input_tokens=result.input_tokens, output_tokens=result.output_tokens)
    return result
