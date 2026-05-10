#!/usr/bin/env python3
"""
Minimal local MCP server for generic site operations.
Exposes:
  - site_probe(url, screenshot_path?)
  - siteground_probe(screenshot_path?)
"""

import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE_OPS_DIR = ROOT / "tools" / "site-ops"


def first_nonempty_env(*names):
    for name in names:
        value = os.environ.get(name, "")
        if value:
            return value
    return ""


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
            },
            {
                "name": "siteground_probe",
                "description": "Probe SiteGround login/dashboard flow using SITEGROUND_EMAIL/SITEGROUND_PASSWORD from env.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "screenshot_path": {"type": "string"},
                    },
                    "required": [],
                },
            },
        ]
    }


def run_site_ops_command(cmd):
    env = os.environ.copy()
    # Normalize SG aliases for scripts that prefer SITEGROUND_* names.
    siteground_email = first_nonempty_env("SITEGROUND_EMAIL", "SG_USERNAME", "SG_EMAIL", "SITEGROUND_USERNAME")
    siteground_password = first_nonempty_env("SITEGROUND_PASSWORD", "SG_PASSWORD")
    if siteground_email:
        env["SITEGROUND_EMAIL"] = siteground_email
        env["SG_USERNAME"] = siteground_email
    if siteground_password:
        env["SITEGROUND_PASSWORD"] = siteground_password
        env["SG_PASSWORD"] = siteground_password

    proc = subprocess.run(
        cmd,
        cwd=str(SITE_OPS_DIR),
        capture_output=True,
        text=True,
        env=env,
    )
    stdout = proc.stdout.strip()
    stderr = proc.stderr.strip()
    text = stdout if stdout else stderr
    if proc.returncode != 0:
        if stdout and stderr:
            text = f"{stdout}\n\n{stderr}"
        return {"isError": True, "content": [{"type": "text", "text": text}]}
    return {"content": [{"type": "text", "text": text}]}


def call_site_probe(arguments):
    url = arguments.get("url")
    screenshot = arguments.get("screenshot_path")
    cmd = ["npm", "run", "probe", "--", "--url", url]
    if screenshot:
        cmd.extend(["--screenshot", screenshot])
    return run_site_ops_command(cmd)


def call_siteground_probe(arguments):
    screenshot = arguments.get("screenshot_path")
    email = first_nonempty_env("SITEGROUND_EMAIL", "SG_USERNAME", "SG_EMAIL", "SITEGROUND_USERNAME")
    password = first_nonempty_env("SITEGROUND_PASSWORD", "SG_PASSWORD")
    if not email or not password:
        missing = []
        if not email:
            missing.append("SITEGROUND_EMAIL/SG_USERNAME")
        if not password:
            missing.append("SITEGROUND_PASSWORD/SG_PASSWORD")
        return {
            "isError": True,
            "content": [
                {
                    "type": "text",
                    "text": (
                        "Missing required SiteGround credential env var(s): "
                        + ", ".join(missing)
                        + ". Load them via `secrets run -- ...` and ensure mapped pass entries are non-empty."
                    ),
                }
            ],
        }

    cmd = ["npm", "run", "probe-sg", "--"]
    if screenshot:
        cmd.extend(["--screenshot", screenshot])
    return run_site_ops_command(cmd)


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
            elif name == "siteground_probe":
                send({"jsonrpc": "2.0", "id": req_id, "result": call_siteground_probe(arguments)})
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
