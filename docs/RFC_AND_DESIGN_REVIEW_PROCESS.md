# RFC and Design Review Process

Factory infrastructure changes that add a new runtime, shared package, or externally hosted sidecar require a short RFC before implementation. Each RFC records the decision, constraints, rollout plan, required secrets, and verification gates.

## RFC-0001 — Native Browser Automation Service

**Status:** Approved for scaffold implementation  
**Date:** 2026-05-15  
**Owner:** Factory Core  
**Decision:** Add a Dockerized Playwright sidecar on GCP Cloud Run plus a Workers-compatible `@latimer-woods-tech/browser` client.

### Context

Factory needs on-demand native browser automation for lead generation/social scraping and self-healing QA loops. Existing Playwright usage in CI remains useful for static smoke tests, but dynamic scraping and visual checks need a callable runtime API.

### Architecture

- `apps/browser-agent` runs Playwright in GCP Cloud Run using the existing xico-city-style GCP sidecar pattern.
- Cloud Run IAM protects the service endpoint; callers authenticate with Google-signed ID tokens.
- `@latimer-woods-tech/browser` remains Cloudflare Workers-compatible and contains no Node built-ins.
- First exported methods are `scrape(url, selectors)` and `screenshot(url)`.

### Governance

- Use the least-privilege service account `browser-agent-sa@factory-495015.iam.gserviceaccount.com`.
- Do not use the legacy `factory-sa@` account.
- Store service-account JSON only in secrets; never commit it to docs, source, or Wrangler vars.
- Treat scraped content as untrusted input before sending it to `@latimer-woods-tech/llm` or outreach systems.

### Required secrets

- `BROWSER_AGENT_SA_KEY`
- `BROWSER_AGENT_URL`
- `BROWSER_AGENT_AUDIENCE`

### Rollout phases

1. Scaffold RFC, Browser Agent app, and browser client package.
2. Provision the service account and deploy Cloud Run with IAM-only invocation.
3. Wire first cron Worker consumer after the Cloud Run `/health` endpoint is verified.
