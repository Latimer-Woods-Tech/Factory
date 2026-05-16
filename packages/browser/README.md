# @latimer-woods-tech/browser

Workers-compatible client for the Factory Browser Agent Cloud Run sidecar.

```ts
const browser = createBrowserClient({
  agentUrl: env.BROWSER_AGENT_URL,
  audience: env.BROWSER_AGENT_AUDIENCE,
  serviceAccountKey: env.BROWSER_AGENT_SA_KEY,
});

const result = await browser.scrape('https://example.com', { title: 'h1' });
```
