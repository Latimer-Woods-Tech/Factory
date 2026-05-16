# Browser Agent

Dockerized Playwright service for GCP Cloud Run. Cloud Run IAM protects the public endpoint; Factory Workers call it through `@latimer-woods-tech/browser` using `BROWSER_AGENT_SA_KEY`, `BROWSER_AGENT_URL`, and `BROWSER_AGENT_AUDIENCE`.

## Endpoints

- `GET /health`
- `POST /scrape` with `{ "url": "https://example.com", "selectors": { "title": "h1" } }`
- `POST /screenshot` with `{ "url": "https://example.com" }`

Build the image from this directory after `npm run build` or with the included multi-stage Dockerfile.
