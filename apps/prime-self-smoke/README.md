# prime-self-smoke

This package contains the Playwright-based smoke probe harness for the Factory Admin Studio UI.

## Purpose

`apps/prime-self-smoke` is used to verify that the Admin Studio UI is reachable, can log in, and can navigate key pages successfully. It is intended for automated quality checks, not for normal user login.

## Authentication pattern

Use a dedicated automation account for smoke probes.

- Do not use a personal or administrative backdoor account.
- Do not hardcode credentials in source code.
- Store credentials as secrets in GitHub Actions or a secure secret manager.
- Prefer a machine/test account with limited scope and easy rotation.

## Required secrets

The GitHub Actions workflow `/.github/workflows/smoke-admin-studio.yml` expects the following secrets:

- `SMOKE_ADMIN_EMAIL`
- `SMOKE_ADMIN_PASSWORD`

These are mapped to the probe script via `STUDIO_EMAIL` and `STUDIO_PASSWORD` environment variables.

## Local development

You can run the probe locally by setting either:

- `SMOKE_ADMIN_EMAIL` and `SMOKE_ADMIN_PASSWORD`, or
- `STUDIO_CREDS_FILE` pointing to a file containing:
  ```text
  email: your-automation-email@example.com
  password: your-secret-password
  ```

Example:

```bash
cd apps/prime-self-smoke
export SMOKE_ADMIN_EMAIL="automation@latwoodtech.com"
export SMOKE_ADMIN_PASSWORD="super-secret"
npm install
npx playwright install --with-deps chromium
node scripts/probe-factory-admin.mjs
```

## GitHub Actions

The smoke workflow is defined in `.github/workflows/smoke-admin-studio.yml`.
It runs every 2 hours and is also manually dispatchable.

## Security notes

- Treat `SMOKE_ADMIN_EMAIL` and `SMOKE_ADMIN_PASSWORD` as confidential secrets.
- Use GitHub repo-level or organization-level secrets, not checked-in files.
- Rotate these credentials regularly and revoke them if there is any doubt.
- The smoke probe account should be scoped only to the Admin Studio smoke path.
