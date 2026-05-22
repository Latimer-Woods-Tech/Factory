/**
 * Sync Cloudflare Stream videos to YouTube.
 * Downloads from R2, uploads to YouTube with metadata from the content briefs.
 * 
 * Usage:
 *   node scripts/sync-to-youtube.mjs --app-id prime_self [--dry-run]
 * 
 * Requires: YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN,
 *           R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_DOMAIN
 */

import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseArgs } from 'util';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    'app-id': { type: 'string', default: 'prime_self' },
    'dry-run': { type: 'boolean', default: false },
  },
});

const APP_ID = values['app-id'];
const DRY_RUN = values['dry-run'];
const BRIEFS_DIR = join(__dirname, '..', 'apps', 'video-studio', 'content-briefs', APP_ID.replace(/_/g, '-'));

async function getYouTubeAccessToken() {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.YOUTUBE_CLIENT_ID,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET,
      refresh_token: process.env.YOUTUBE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  if (!r.ok) throw new Error(`Token refresh failed: ${await r.text()}`);
  return (await r.json()).access_token;
}

async function downloadFromStream(streamUid) {
  const CF_STREAM = `https://customer-op4b8eq1uv0ciwqy.cloudflarestream.com/${streamUid}`;
  const downloadUrl = `${CF_STREAM}/downloads/default.mp4`;
  console.log(`Downloading from ${downloadUrl}...`);
  const resp = await fetch(downloadUrl);
  if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);
  return Buffer.from(await resp.arrayBuffer());
}

async function uploadToYouTube(accessToken, { videoBuffer, title, description, tags, thumbnail }) {
  const fileSize = videoBuffer.length;
  
  // Initialize resumable upload
  const initResp = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': 'video/mp4',
        'X-Upload-Content-Length': fileSize,
      },
      body: JSON.stringify({
        snippet: { title, description, tags, categoryId: '27' }, // 27 = Education
        status: { privacyStatus: 'public' },
      }),
    }
  );
  if (!initResp.ok) throw new Error(`Init failed: ${await initResp.text()}`);
  const uploadUrl = initResp.headers.get('Location');
  
  // Upload
  const uploadResp = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'video/mp4', 'Content-Length': fileSize },
    body: videoBuffer,
  });
  if (!uploadResp.ok && uploadResp.status !== 201) throw new Error(`Upload failed: ${await uploadResp.text()}`);
  const video = await uploadResp.json();
  return `https://youtu.be/${video.id}`;
}

// Load all published briefs for the app
const briefs = readdirSync(BRIEFS_DIR)
  .filter(f => f.endsWith('.json') && f !== 'training-library.json')
  .map(f => ({ file: f, data: JSON.parse(readFileSync(join(BRIEFS_DIR, f), 'utf8')) }))
  .filter(({ data }) => data.status === 'published' && data.stream_uid && !data.youtube_url);

console.log(`Found ${briefs.length} published briefs without YouTube URL for ${APP_ID}`);

if (DRY_RUN) {
  briefs.forEach(({ file, data }) => console.log(`  [DRY] Would upload: ${data.topic} (${data.stream_uid})`));
  process.exit(0);
}

const accessToken = await getYouTubeAccessToken();

for (const { file, data } of briefs) {
  console.log(`\nProcessing: ${data.topic}`);
  try {
    const videoBuffer = await downloadFromStream(data.stream_uid);
    const description = [
      data.learningGoal || '',
      '',
      data.keyPoints?.map(p => `• ${p}`).join('\n') || '',
      '',
      `Learn more at https://selfprime.net`,
    ].join('\n').trim();
    
    const tags = ['prime self', 'human design', 'energy blueprint', 
                  ...(data.audience ? [data.audience] : [])];
    
    const youtubeUrl = await uploadToYouTube(accessToken, {
      videoBuffer,
      title: data.topic,
      description,
      tags,
      thumbnail: data.thumbnail_url,
    });
    
    // Update brief with YouTube URL
    data.youtube_url = youtubeUrl;
    writeFileSync(join(BRIEFS_DIR, file), JSON.stringify(data, null, 2));
    console.log(`Uploaded: ${youtubeUrl}`);
  } catch (err) {
    console.error(`Failed ${data.topic}: ${err.message}`);
  }
}
console.log('\nSync complete.');
