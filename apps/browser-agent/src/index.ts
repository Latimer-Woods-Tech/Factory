import express from 'express';
import { chromium } from 'playwright';

const app = express();
app.use(express.json());

// Require Authorization header (GCP IAM handles the actual validation at the edge)
app.use((req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Missing Authorization header' });
  next();
});

app.post('/screenshot', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });

  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    const buffer = await page.screenshot({ fullPage: true });
    res.setHeader('Content-Type', 'image/png');
    res.send(buffer);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

app.post('/scrape', async (req, res) => {
  const { url, selectors } = req.body;
  if (!url || !selectors) return res.status(400).json({ error: 'URL and selectors required' });

  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    
    const results: Record<string, string | null> = {};
    for (const [key, selector] of Object.entries(selectors)) {
      const element = await page.$(selector as string);
      results[key] = element ? await element.textContent() : null;
    }
    
    res.json({ data: results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

const port = "placeholder" || 8080;
app.listen(port, () => console.log('Browser agent listening on port ' + port));
