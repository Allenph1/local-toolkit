#!/usr/bin/env python3
"""
Minimal local MCP server for generic site operations.
Exposes one tool: site_probe(url, screenshot_path?)
"""

import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE_OPS_DIR = ROOT / "tools" / "site-ops"


def list_tools():
    return {
        "tools": [
            {
                "name": "site_probe",
                "description": "Probe a URL with Playwright and return status/title/timing.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "url": {"type": "string"},
                        "screenshot_path": {"type": "string"},
                    },
                    "required": ["url"],
                },
            }
        ]
    }


def call_site_probe(arguments):
    url = arguments.get("url")
    screenshot = arguments.get("screenshot_path")
    cmd = ["npm", "run", "probe", "--", "--url", url]
    if screenshot:
        cmd.extend(["--screenshot", screenshot])

    proc = subprocess.run(
        cmd,
        cwd=str(SITE_OPS_DIR),
        capture_output=True,
        text=True,
        env=os.environ.copy(),
    )
    text = proc.stdout.strip() if proc.stdout.strip() else proc.stderr.strip()
    if proc.returncode != 0:
        return {"isError": True, "content": [{"type": "text", "text": text}]}
    return {"content": [{"type": "text", "text": text}]}


def send(msg):
    sys.stdout.write(json.dumps(msg) + "\n")
    sys.stdout.flush()


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError:
            continue

        req_id = req.get("id")
        method = req.get("method")
        params = req.get("params", {})

        if method == "tools/list":
            send({"jsonrpc": "2.0", "id": req_id, "result": list_tools()})
        elif method == "tools/call":
            name = params.get("name")
            arguments = params.get("arguments", {})
            if name == "site_probe":
                send({"jsonrpc": "2.0", "id": req_id, "result": call_site_probe(arguments)})
            else:
                send(
                    {
                        "jsonrpc": "2.0",
                        "id": req_id,
                        "error": {"code": -32601, "message": f"Unknown tool: {name}"},
                    }
                )
        else:
            send(
                {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "error": {"code": -32601, "message": f"Unknown method: {method}"},
                }
            )


if __name__ == "__main__":
    main()
