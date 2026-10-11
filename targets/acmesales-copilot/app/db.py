from __future__ import annotations
import sqlite3
from . import config

def connect() -> sqlite3.Connection:
    config.DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(config.DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def rows(cur) -> list[dict]:
    return [dict(r) for r in cur.fetchall()]
