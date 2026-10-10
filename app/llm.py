"""One chat() interface over LiteLLM (OpenAI-compatible) or AWS Bedrock, both traced by neatlogs."""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any
import json
from . import tracing  # noqa: F401  (init before importing openai)
import neatlogs
from . import config

@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict

@dataclass
class LLMResult:
    content: str | None
    tool_calls: list[ToolCall]
    input_tokens: int
    output_tokens: int
    raw_assistant_message: Any = None   # provider-native message to append to history

def cost_usd(model: str, inp: int, out: int) -> float:
    pin, pout = config.PRICES.get(model, (3.0, 15.0))
    return (inp * pin + out * pout) / 1_000_000

# ---------------- LiteLLM / OpenAI-compatible ----------------
_openai_client = None

def _openai():
    global _openai_client
    if _openai_client is None:
        from openai import OpenAI
        _openai_client = neatlogs.wrap(OpenAI(base_url=config.LITELLM_BASE_URL, api_key=config.LITELLM_API_KEY))
    return _openai_client

def _chat_openai(messages: list[dict], tools: list[dict]) -> LLMResult:
    resp = _openai().chat.completions.create(model=config.MODEL, messages=messages, tools=tools, tool_choice="auto",
                                             temperature=0.2, max_tokens=900)
    msg = resp.choices[0].message
    calls = []
    for tc in (msg.tool_calls or []):
        try:
            args = json.loads(tc.function.arguments or "{}")
        except json.JSONDecodeError:
            args = {"_raw": tc.function.arguments}
        calls.append(ToolCall(id=tc.id, name=tc.function.name, arguments=args))
    u = resp.usage
    return LLMResult(content=msg.content, tool_calls=calls, input_tokens=u.prompt_tokens if u else 0,
                     output_tokens=u.completion_tokens if u else 0, raw_assistant_message=msg.model_dump(exclude_none=True))

# ---------------- Bedrock (converse) ----------------
_bedrock_client = None

def _bedrock():
    global _bedrock_client
    if _bedrock_client is None:
        import boto3
        _bedrock_client = neatlogs.wrap(boto3.client("bedrock-runtime", region_name=config.BEDROCK_REGION))
    return _bedrock_client

def _to_bedrock_messages(messages: list[dict]) -> tuple[list[dict], list[dict]]:
    system = [{"text": m["content"]} for m in messages if m["role"] == "system"]
    out: list[dict] = []
    for m in messages:
        if m["role"] == "system":
            continue
        if m["role"] == "user":
            out.append({"role": "user", "content": [{"text": m["content"]}]})
        elif m["role"] == "assistant":
            content = []
            if m.get("content"):
                content.append({"text": m["content"]})
            for tc in m.get("tool_calls", []) or []:
                content.append({"toolUse": {"toolUseId": tc["id"], "name": tc["function"]["name"],
                                            "input": json.loads(tc["function"]["arguments"] or "{}")}})
            out.append({"role": "assistant", "content": content})
        elif m["role"] == "tool":
            block = {"toolResult": {"toolUseId": m["tool_call_id"], "content": [{"text": m["content"]}]}}
            if out and out[-1]["role"] == "user" and "toolResult" in out[-1]["content"][0]:
                out[-1]["content"].append(block)
            else:
                out.append({"role": "user", "content": [block]})
    return system, out

def _chat_bedrock(messages: list[dict], tools: list[dict]) -> LLMResult:
    system, msgs = _to_bedrock_messages(messages)
    tool_config = {"tools": [{"toolSpec": {"name": t["function"]["name"], "description": t["function"]["description"],
                                            "inputSchema": {"json": t["function"]["parameters"]}}} for t in tools]}
    resp = _bedrock().converse(modelId=config.MODEL, system=system, messages=msgs, toolConfig=tool_config,
                               inferenceConfig={"temperature": 0.2, "maxTokens": 900})
    content = resp["output"]["message"]["content"]
    text = "".join(b.get("text", "") for b in content if "text" in b) or None
    calls = [ToolCall(id=b["toolUse"]["toolUseId"], name=b["toolUse"]["name"], arguments=b["toolUse"]["input"])
             for b in content if "toolUse" in b]
    u = resp.get("usage", {})
    raw = {"role": "assistant", "content": text,
           "tool_calls": [{"id": c.id, "type": "function", "function": {"name": c.name, "arguments": json.dumps(c.arguments)}} for c in calls] or None}
    return LLMResult(content=text, tool_calls=calls, input_tokens=u.get("inputTokens", 0), output_tokens=u.get("outputTokens", 0),
                     raw_assistant_message={k: v for k, v in raw.items() if v is not None})

def chat(messages: list[dict], tools: list[dict]) -> LLMResult:
    if config.PROVIDER == "bedrock":
        return _chat_bedrock(messages, tools)
    return _chat_openai(messages, tools)
