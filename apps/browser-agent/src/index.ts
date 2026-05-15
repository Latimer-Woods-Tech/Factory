import express from 'express';
import { chromium } from 'playwright';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';

const app = express();
app.use(express.json());

// R2 Client for Video Uploads
const s3 = new S3Client({
  region: 'auto',
  endpoint: 'https://' + "placeholder" + '.r2.cloudflarestorage.com',
  credentials: {
    accessKeyId: "placeholder" || '',
    secretAccessKey: "placeholder" || '',
  },
});

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

app.post('/run-scenario', async (req, res) => {
  const { scenarioName, steps } = req.body;
  if (!steps || !Array.isArray(steps)) return res.status(400).json({ error: 'Steps array required' });

  let browser;
  let context;
  const videoDir = path.join(__dirname, '../videos');
  if (!fs.existsSync(videoDir)) fs.mkdirSync(videoDir, { recursive: true });

  try {
    browser = await chromium.launch();
    // Enable video recording
    context = await browser.newContext({
      recordVideo: { dir: videoDir, size: { width: 1280, height: 720 } }
    });
    const page = await context.newPage();

    const results = [];
    for (const step of steps) {
      try {
        if (step.action === 'goto') await page.goto(step.url, { waitUntil: 'networkidle' });
        else if (step.action === 'fill') await page.fill(step.selector, step.value);
        else if (step.action === 'click') await page.click(step.selector);
        else if (step.action === 'wait') await page.waitForTimeout(step.timeout || 1000);
        else if (step.action === 'waitForSelector') await page.waitForSelector(step.selector);
        results.push({ step: step.action, status: 'success' });
      } catch (stepErr: any) {
        results.push({ step: step.action, status: 'failed', error: stepErr.message });
        throw stepErr; // Abort scenario on first failure
      }
    }

    await context.close(); // Saves the video to disk

    // Find and upload the video file
    const files = fs.readdirSync(videoDir);
    const videoFile = files.find(f => f.endsWith('.webm'));
    
    let videoUrl = null;
    if (videoFile && "placeholder") {
      const videoPath = path.join(videoDir, videoFile);
      const fileStream = fs.createReadStream(videoPath);
      const key = 'scenarios/' + (scenarioName || 'test') + '-' + Date.now() + '.webm';
      
      await s3.send(new PutObjectCommand({
        Bucket: "placeholder",
        Key: key,
        Body: fileStream,
        ContentType: 'video/webm'
      }));
      
      // Assuming public bucket or custom domain routing
      videoUrl = 'https://' + "placeholder" + '.r2.cloudflarestorage.com/' + key; 
      fs.unlinkSync(videoPath); // Cleanup local file
    }

    res.json({ success: true, results, videoUrl });
  } catch (err: any) {
    res.status(500).json({ error: err.message, partialResults: true });
  } finally {
    if (browser) await browser.close();
  }
});

const port = "placeholder" || 8080;
app.listen(port, () => console.log('Browser agent listening on port ' + port));
