---
name: site-ops-skill
description: Probe websites, run UI tests, and execute guarded login workflows using Playwright.
---

# site-ops-skill

## Purpose

Generic local web automation for personal workflows:

- endpoint + UI probing
- regression checks for key pages
- operator-guided login automation (with explicit 2FA checkpoints)
- secret-backed command execution via `secret-run` and `pass` when a workflow needs credentials

## Backing MCP

- `mcp/site_ops_mcp_server.py`
- Tool: `site_probe`

## Boundaries

- Keep this skill generic (not rack-specific).
- Rack and network device workflows stay in `rack-agent-stack`.
- When credentials are needed, read them from env vars injected by `secret-run`, not from chat or repo files.
