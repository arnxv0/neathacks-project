"""Tiny repositories used by the sandbox tests. Everything is local: a bare repo on disk stands in for GitHub."""
from __future__ import annotations
import os, pathlib, subprocess

GIT_ENV = {"PATH": os.environ.get("PATH", ""), "HOME": os.environ.get("HOME", "/"), "GIT_CONFIG_GLOBAL": os.devnull, "GIT_CONFIG_NOSYSTEM": "1",
           "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@example.com", "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@example.com"}

OPENAI_AGENT = {
    "pyproject.toml": '[project]\nname = "tiny-agent"\nversion = "0.1.0"\ndependencies = ["openai>=1.0", "fastapi", "httpx"]\n',
    "agent/__init__.py": "",
    "agent/core.py": 'from openai import OpenAI\n\ndef answer(message: str) -> str:\n    return OpenAI().chat.completions.create(model="m", messages=[{"role": "user", "content": message}]).choices[0].message.content\n',
    "agent/server.py": 'from fastapi import FastAPI\nfrom .core import answer\napp = FastAPI()\n\n@app.post("/ask")\ndef ask(q: str):\n    return {"a": answer(q)}\n',
    "main.py": 'from agent.core import answer\n\nif __name__ == "__main__":\n    print(answer(input()))\n',
    ".env.example": "OPENAI_API_KEY=\nexport SEARCH_BASE_URL=https://example.com\n# comment\nlowercase=no\n",
    "tests/test_core.py": "def test_nothing():\n    assert True\n",
    "README.md": "# tiny agent\n",
}
LANGCHAIN_AGENT = {
    "requirements.txt": "langchain>=0.3\nlangchain-openai\nlanggraph==0.2.0  # graph\nflask\n-r other.txt\n",
    "bot.py": 'from langchain_openai import ChatOpenAI\nfrom flask import Flask\napp = Flask(__name__)\n\ndef main():\n    return ChatOpenAI()\n',
}
NON_AGENT = {
    "package.json": '{"name": "site", "main": "index.js", "scripts": {"start": "node index.js"}, "dependencies": {"express": "^4", "lodash": "^4"}}',
    "index.js": 'const express = require("express");\nconst app = express();\napp.listen(3000);\n',
}
MANIFEST = """system: tiny
entrypoint: agent
ownership_token: "${PREFLIGHT_OWNERSHIP_TOKEN}"
components:
  agent:
    repo: .
    start: python preflight_adapter.py
    healthcheck: http://localhost:${PORT}/health
    chat_endpoint: http://localhost:${PORT}/chat
    tools_endpoint: http://localhost:${PORT}/preflight/tools
    state_endpoint: http://localhost:${PORT}/preflight/state
    runs_endpoint: http://localhost:${PORT}/preflight/runs
    test_command: python -c "import preflight_adapter"
    editable_paths: [agent/]
    tools:
      search:
        source: agent/core.py:answer
        upstream_env: SEARCH_BASE_URL
"""
ADAPTER = "from fastapi import FastAPI\napp = FastAPI()\n"
NATIVE = {**OPENAI_AGENT, "preflight.yaml": MANIFEST, "preflight_adapter.py": ADAPTER}

def write_tree(root: pathlib.Path, files: dict[str, str]) -> pathlib.Path:
    for rel, text in files.items():
        p = root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text)
    return root

def bare_repo(tmp: pathlib.Path, files: dict[str, str], name: str = "origin") -> str:
    """A committed work tree cloned to a bare repo; returns its file:// URL."""
    work = write_tree(tmp / f"{name}-work", files)
    for args in (["init", "-q", "-b", "main"], ["add", "-A"], ["commit", "-q", "-m", "init"]):
        subprocess.run(["git", *args], cwd=work, env=GIT_ENV, check=True, capture_output=True)
    bare = tmp / f"{name}.git"
    subprocess.run(["git", "clone", "-q", "--bare", str(work), str(bare)], env=GIT_ENV, check=True, capture_output=True)
    return f"file://{bare}"
