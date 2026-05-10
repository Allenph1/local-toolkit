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

## Secret injection

- Store secret values in `pass`
- Put secret name mappings in `~/.config/local-toolkit/secrets.map`
- Run any command through `secret-run -- ...` to load them into that process only
- SiteGround probes can then run with `SITEGROUND_EMAIL` and `SITEGROUND_PASSWORD` without putting values on the command line

Example map:

```text
SITEGROUND_EMAIL=pass:siteground/email
SITEGROUND_PASSWORD=pass:siteground/password
```

## Notes

- Keep credentials out of git. Use env vars and local secret stores.
- For SiteGround workflows, keep login steps explicit and require manual 2FA handoff.
