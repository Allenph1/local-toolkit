# local-toolkit

Personal general-purpose bucket you can install anywhere.

## Scope split

- `rack-agent-stack`: rack/network-only skills and MCP servers.
- `local-toolkit`: personal/local workflows, dotfiles, workstation bootstrap, generic site automation.

## Layout

- `dotfiles/` - bash, tmux, emacs config managed by this repo
- `bootstrap.sh` - one-command installer (packages + dotfile links)
- `tools/site-ops/` - Playwright-based probing and UI testing helpers
- `mcp/` - generic MCP servers used by local workflows
- `skills/` - local skills metadata/docs

## Quick start

```bash
cd ~/local-toolkit
./bootstrap.sh
```

Optional flags:

```bash
./bootstrap.sh --no-packages
./bootstrap.sh --no-site-ops
```

## Site ops quick start

```bash
cd ~/local-toolkit/tools/site-ops
npm install
npx playwright install chromium
npm run probe -- --url https://example.com
npm test
```

## Notes

- Keep credentials out of git. Use env vars and local secret stores.
- For SiteGround workflows, keep login steps explicit and require manual 2FA handoff.
