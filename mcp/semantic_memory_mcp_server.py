#!/usr/bin/env python3
"""
Semantic memory MCP server for local-toolkit.

Tools:
- memory_write(text, source?, tags?)
- memory_search(query, limit?)
- memory_stats()
"""

from __future__ import annotations

import argparse
import json
import math
import sqlite3
import sys
import threading
from pathlib import Path
from typing import Any


SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS memory_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source TEXT NOT NULL DEFAULT 'manual',
  text TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '',
  embedding_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_memory_created ON memory_entries(created_at DESC);
"""


TOOLS = [
    {
        "name": "memory_write",
        "description": "Store a memory entry and embed it for semantic retrieval.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "text": {"type": "string"},
                "source": {"type": "string"},
                "tags": {"type": "string"},
            },
            "required": ["text"],
        },
    },
    {
        "name": "memory_search",
        "description": "Semantic + lexical search over memory entries.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "limit": {"type": "integer", "minimum": 1, "maximum": 50, "default": 5},
            },
            "required": ["query"],
        },
    },
    {
        "name": "memory_stats",
        "description": "Get memory entry counts and embedder status.",
        "inputSchema": {"type": "object", "properties": {}, "required": []},
    },
]


class SemanticMemoryServer:
    def __init__(self, db_path: Path):
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(str(db_path), check_same_thread=False, timeout=30)
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA synchronous=NORMAL")
        self.conn.executescript(SCHEMA_SQL)
        self.conn.commit()
        self.lock = threading.Lock()
        self.write_lock = threading.Lock()
        self._embedder = None
        self._embedder_error = None

    def _send(self, msg: dict[str, Any]) -> None:
        with self.write_lock:
            sys.stdout.write(json.dumps(msg) + "\n")
            sys.stdout.flush()

    def _ok(self, req_id: Any, result: dict[str, Any]) -> None:
        self._send({"jsonrpc": "2.0", "id": req_id, "result": result})

    def _err(self, req_id: Any, code: int, message: str) -> None:
        self._send({"jsonrpc": "2.0", "id": req_id, "error": {"code": code, "message": message}})

    def _get_embedder(self):
        if self._embedder is not None or self._embedder_error is not None:
            return self._embedder
        try:
            from fastembed import TextEmbedding

            self._embedder = TextEmbedding()
        except Exception as exc:  # explicit surface; server still works lexically
            self._embedder_error = str(exc)
            self._embedder = None
        return self._embedder

    def _embed(self, text: str) -> list[float] | None:
        embedder = self._get_embedder()
        if embedder is None:
            return None
        vec = next(embedder.embed([text]))
        return [float(x) for x in vec.tolist()]

    @staticmethod
    def _cosine(a: list[float], b: list[float]) -> float:
        if len(a) != len(b) or not a:
            return 0.0
        dot = sum(x * y for x, y in zip(a, b))
        na = math.sqrt(sum(x * x for x in a))
        nb = math.sqrt(sum(y * y for y in b))
        if na == 0 or nb == 0:
            return 0.0
        return dot / (na * nb)

    def tool_write(self, args: dict[str, Any]) -> dict[str, Any]:
        text = str(args.get("text", "")).strip()
        if not text:
            raise ValueError("text is required")
        source = str(args.get("source", "manual"))
        tags = str(args.get("tags", ""))
        embedding = self._embed(text)
        embedding_json = json.dumps(embedding) if embedding is not None else None
        with self.lock:
            cur = self.conn.execute(
                """
                INSERT INTO memory_entries(source, text, tags, embedding_json)
                VALUES (?, ?, ?, ?)
                """,
                (source, text, tags, embedding_json),
            )
            self.conn.commit()
            row_id = int(cur.lastrowid)
        return {"ok": True, "id": row_id, "embedded": embedding is not None}

    def tool_search(self, args: dict[str, Any]) -> dict[str, Any]:
        query = str(args.get("query", "")).strip()
        if not query:
            raise ValueError("query is required")
        limit = int(args.get("limit", 5))
        limit = max(1, min(limit, 50))

        with self.lock:
            rows = self.conn.execute(
                """
                SELECT id, created_at, source, text, tags, embedding_json
                FROM memory_entries
                ORDER BY id DESC
                LIMIT 500
                """
            ).fetchall()

        q = query.lower()
        q_embed = self._embed(query)
        scored = []
        for row in rows:
            text = row[3]
            tags = row[4] or ""
            hay = f"{text} {tags}".lower()
            lexical = 1.0 if q in hay else 0.0
            if lexical == 0.0:
                overlap = sum(1 for tok in q.split() if tok and tok in hay)
                lexical = overlap / max(1, len(q.split()))

            semantic = 0.0
            emb_json = row[5]
            if q_embed is not None and emb_json:
                try:
                    emb = json.loads(emb_json)
                    semantic = self._cosine(q_embed, emb)
                except Exception:
                    semantic = 0.0

            score = (0.7 * semantic) + (0.3 * lexical)
            if score > 0:
                scored.append(
                    {
                        "id": row[0],
                        "created_at": row[1],
                        "source": row[2],
                        "text": text,
                        "tags": tags,
                        "score": round(score, 4),
                        "semantic": round(semantic, 4),
                        "lexical": round(lexical, 4),
                    }
                )

        scored.sort(key=lambda x: x["score"], reverse=True)
        return {
            "ok": True,
            "count": len(scored[:limit]),
            "results": scored[:limit],
            "semantic_enabled": q_embed is not None,
            "embedder_error": self._embedder_error,
        }

    def tool_stats(self) -> dict[str, Any]:
        with self.lock:
            total = self.conn.execute("SELECT COUNT(*) FROM memory_entries").fetchone()[0]
            embedded = self.conn.execute(
                "SELECT COUNT(*) FROM memory_entries WHERE embedding_json IS NOT NULL"
            ).fetchone()[0]
        self._get_embedder()
        return {
            "ok": True,
            "entries_total": int(total),
            "entries_embedded": int(embedded),
            "semantic_enabled": self._embedder is not None,
            "embedder_error": self._embedder_error,
        }

    def handle(self, msg: dict[str, Any]) -> None:
        req_id = msg.get("id")
        method = msg.get("method", "")
        params = msg.get("params", {})

        if method == "initialize":
            self._ok(
                req_id,
                {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {"tools": {}},
                    "serverInfo": {"name": "semantic-memory-mcp", "version": "0.1.0"},
                },
            )
            return
        if method == "tools/list":
            self._ok(req_id, {"tools": TOOLS})
            return
        if method == "tools/call":
            name = params.get("name")
            args = params.get("arguments", {})
            try:
                if name == "memory_write":
                    out = self.tool_write(args)
                elif name == "memory_search":
                    out = self.tool_search(args)
                elif name == "memory_stats":
                    out = self.tool_stats()
                else:
                    self._err(req_id, -32601, f"Unknown tool: {name}")
                    return
                self._ok(req_id, {"content": [{"type": "text", "text": json.dumps(out)}]})
            except Exception as exc:
                self._err(req_id, -32000, f"Tool error: {exc}")
            return
        self._err(req_id, -32601, f"Unknown method: {method}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Semantic Memory MCP server")
    parser.add_argument("--db", type=Path, default=Path(".data/semantic_memory.sqlite"))
    args = parser.parse_args()
    server = SemanticMemoryServer(args.db)
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
            server.handle(msg)
        except Exception:
            continue


if __name__ == "__main__":
    main()
