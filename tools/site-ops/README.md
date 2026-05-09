# site-ops toolkit

Playwright-based local automation for:

- probing site health and render correctness
- UI test coverage
- scripted operator workflows with explicit authentication checkpoints

## Security model

- Never hardcode credentials in code or repo.
- Pull credentials from environment variables or local keychain tooling.
- For high-risk logins (like SiteGround), require manual 2FA completion.

## Commands

```bash
npm install
npx playwright install chromium
npm run probe -- --url https://example.com --screenshot artifacts/example.png
npm test
npm run probe-sg -- --email user@example.com --password pass [--screenshot artifacts/sg.png]
```

## SiteGround automation

SiteGround tests automatically skip without credentials:

```bash
SITEGROUND_EMAIL=user@example.com SITEGROUND_PASSWORD=pass npm test
```

SiteGround direct probe (includes 2FA checkpoint):

```bash
npm run probe-sg -- --email user@example.com --password pass
```

**2FA Workflow:** When prompted for 2FA, manually complete it in the browser and the test will detect success/failure automatically.

## SiteGround implementation guideline

Use deterministic steps:

1. Navigate and assert expected login form selectors.
2. Fill username/password from env vars.
3. Pause for 2FA checkpoint and user confirmation.
4. Continue only after post-login dashboard assertions pass.
