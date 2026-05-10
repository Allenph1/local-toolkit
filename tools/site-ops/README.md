# site-ops toolkit

Playwright-based local automation for:

- probing site health and render correctness
- UI test coverage
- scripted operator workflows with explicit authentication checkpoints

## Security model

- Never hardcode credentials in code or repo.
- Pull credentials from environment variables or local keychain tooling.
- For high-risk logins (like SiteGround), require manual 2FA completion.
- For local secret injection, use `secret-run -- ...` with `~/.config/local-toolkit/secrets.map` and `pass`.

## Commands

```bash
npm install
npx playwright install chromium
npm run probe -- --url https://example.com --screenshot artifacts/example.png
npm test
secret-run -- npm run probe-sg [--screenshot artifacts/sg.png]
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

Example map file:

```text
SITEGROUND_EMAIL=pass:siteground/email
SITEGROUND_PASSWORD=pass:siteground/password
```

**2FA Workflow:** When prompted for 2FA, manually complete it in the browser and the test will detect success/failure automatically.

## SiteGround implementation guideline

Use deterministic steps:

1. Navigate and assert expected login form selectors.
2. Fill username/password from env vars.
3. Pause for 2FA checkpoint and user confirmation.
4. Continue only after post-login dashboard assertions pass.
