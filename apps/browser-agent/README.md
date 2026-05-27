# Browser Agent

Dockerized Playwright service for GCP Cloud Run. Cloud Run IAM protects the public endpoint; Factory Workers call it through `@latimer-woods-tech/browser` using `BROWSER_AGENT_SA_KEY`, `BROWSER_AGENT_URL`, and `BROWSER_AGENT_AUDIENCE`.

## Endpoints

- `GET /health`
- `POST /scrape` with `{ "url": "https://example.com", "selectors": { "title": "h1" } }`
- `POST /screenshot` with `{ "url": "https://example.com" }`
- `POST /audit` with `{ "url": "https://example.com", "steps"?: [...], "captureConsole"?: true, "statusThreshold"?: 400 }`
- `POST /run-scenario` with `{ "steps": [...] }` (records video to R2 when configured)
- `POST /visual-review` with `{ "url", "steps"?, "viewports"?, "rubric"?, "model"?, "captureConsole"?, "statusThreshold"? }`

### `/visual-review`

Captures full-page screenshots across one or more viewports (default: desktop 1280×720 + mobile 375×667) after optionally running pre-capture scenario steps (login, navigation). When `LATIMER_ANTHROPIC_API` is bound at runtime, the screenshots are sent to Claude Haiku with a configurable rubric and the response is parsed into a structured `review.findings` array:

```jsonc
{
  "url": "https://selfprime.net/?start=1",
  "reviewedAt": "2026-05-27T01:00:00.000Z",
  "viewports": [
    { "viewport": "desktop", "width": 1280, "height": 720, "screenshotBase64": "..." },
    { "viewport": "mobile",  "width":  375, "height": 667, "screenshotBase64": "..." }
  ],
  "consoleErrors": [],
  "pageErrors": [],
  "failedRequests": [],
  "review": {
    "model": "claude-haiku-4-5-20251001",
    "summary": "Layout is clean; mobile CTA contrast is borderline.",
    "findings": [
      {
        "severity": "medium",
        "category": "color",
        "viewport": "mobile",
        "description": "Primary CTA contrast is borderline against the hero background.",
        "recommendation": "Increase CTA text weight or darken the background overlay."
      }
    ],
    "tokenUsage": { "input": 1200, "output": 250 }
  }
}
```

If neither `ANTHROPIC_API_KEY` nor `LATIMER_ANTHROPIC_API` is set, `review` is `null` and only the screenshots + diagnostics are returned.

Local invocation via the helper: `scripts/test-site.sh https://selfprime.net/?start=1 visual-review`.

Build the image from this directory after `npm run build` or with the included multi-stage Dockerfile.
