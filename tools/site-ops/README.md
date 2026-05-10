# site-ops toolkit

Playwright-based local automation for:

- probing site health and render correctness
- UI test coverage
- scripted operator workflows with explicit authentication checkpoints

## Security model

- Never hardcode credentials in code or repo.
- Pull credentials from environment variables or local keychain tooling.
- For high-risk logins (like SiteGround), require manual 2FA completion.
- For local secret injection, use `secrets`/`secret-run -- ...` with `~/.config/local-toolkit/secrets.map` and `pass`.
- The Ansible install bootstraps GPG and `pass` automatically.
- Secret values are single-line only.
- `secrets gpg` can auto-create a local GPG key and initialize `pass`.

## Commands

```bash
npm install
npx playwright install chromium
npm run probe -- --url https://example.com --screenshot artifacts/example.png
npm test
secret-run -- npm run probe -- --url https://example.com
secrets add APP_TOKEN app/token
secrets add DB_PASSWORD db/password
secrets doctor
```

## SiteGround automation

SiteGround tests automatically skip without credentials:

```bash
secret-run -- npm test
```

SiteGround direct probe (includes 2FA checkpoint):

```bash
secret-run -- npm run probe-sg
```

Accepted credential env names: `SITEGROUND_EMAIL`/`SITEGROUND_PASSWORD` or `SG_USERNAME`/`SG_PASSWORD`.

SiteGround read-only inventory (no mutations):

```bash
secrets run -- npm run sg-auth
secrets run -- npm run sg-read -- list-sites
secrets run -- npm run sg-read -- list-ssh-keys --site example.com
```

`sg-read` tries cached auth first (`.data/siteground-auth.json`), then automatic login.
If a challenge/2FA blocks automation, run `secrets run -- npm run sg-auth` to open a browser, complete challenge/2FA, then rerun `sg-read`.

Example map file:

```text
APP_TOKEN=pass:app/token
DB_PASSWORD=pass:db/password
```

**2FA Workflow:** When prompted for 2FA, manually complete it in the browser and the test will detect success/failure automatically.

## SiteGround implementation guideline

Use deterministic steps:

1. Navigate and assert expected login form selectors.
2. Fill username/password from env vars.
3. Pause for 2FA checkpoint and user confirmation.
4. Continue only after post-login dashboard assertions pass.
