# local-toolkit

Personal general-purpose bucket you can install anywhere.

## Scope split

- `rack-agent-stack`: rack/network-only skills and MCP servers.
- `local-toolkit`: personal/local workflows, dotfiles, workstation bootstrap, generic site automation.

## Layout

- `dotfiles/` - bash, tmux, emacs config managed by this repo
- `ansible/local-toolkit.yml` - one-command node installer
- `tools/site-ops/` - Playwright-based probing and UI testing helpers
- `mcp/` - generic MCP servers used by local workflows
- `skills/` - local skills metadata/docs

## Quick start

On a fresh node after installing Ansible:

```bash
ansible-playbook -i localhost, -c local ansible/local-toolkit.yml
```

Then use `toolkit help` for a quick command index.

## Site ops quick start

```bash
cd ~/local-toolkit/tools/site-ops
npm install
npx playwright install chromium
npm run probe -- --url https://example.com
npm test
```

## MCP runtime

- MCP servers are dockerized under `mcp/`
- The Ansible playbook installs Docker when available
- The Ansible playbook also installs `gh copilot` and `fzf`
- Login shells and a user systemd unit auto-start the MCP stack via `toolkit mcp start` when Docker is available
- Use `toolkit mcp status|start|stop|restart|site-ops|memory` for the main interface
- CI builds the MCP image and smoke-tests `tools/list` plus memory stats

## Emacs runtime

- `emacs-server` manages the Docker-backed daemon
- `emacs` uses the daemon for eval-style commands and falls back to local terminal Emacs for interactive editing if the container cannot open the TTY
- The Ansible playbook starts the server on login
- `EDITOR`, `VISUAL`, and git editors still point at Emacs

## Secret injection

- Use `secrets` in `bin/` for setup and management
- The Ansible install bootstraps GPG and `pass` automatically
- Store secret values in `pass`
- Put secret name mappings in `~/.config/local-toolkit/secrets.map`
- Run any command through `secret-run -- ...` or `secrets run -- ...` to load them into that process only
- Secrets can then be injected as `APP_TOKEN`, `DB_PASSWORD`, or any other env name without putting values on the command line
- Use `secrets gpg` only if you want to re-seed the local secret store manually
- Add entries with `secrets add APP_TOKEN app/token`
- Secret values are treated as single-line values

Example map:

```text
APP_TOKEN=pass:app/token
DB_PASSWORD=pass:db/password
```

## Notes

- Keep credentials out of git. Use env vars and local secret stores.
- For SiteGround workflows, keep login steps explicit and require manual 2FA handoff.
