/**
 * YouTube video upload script for Factory pipeline.
 * 
 * Prerequisites:
 *   GCP Secret Manager: YOUTUBE_REFRESH_TOKEN, YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET
 *   YouTube Data API v3 enabled in factory-495015 project
 *
 * Usage:
 *   YOUTUBE_REFRESH_TOKEN=<token> YOUTUBE_CLIENT_ID=<id> YOUTUBE_CLIENT_SECRET=<secret> \
 *   node youtube-upload.mjs --file /path/to/video.mp4 \
 *     --title "Video title" --description "Description" \
 *     --tags "prime self,human design" --category "27" --privacy "public"
 */

import { createReadStream, statSync } from 'fs';
import { parseArgs } from 'util';

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    file:        { type: 'string' },
    title:       { type: 'string' },
    description: { type: 'string', default: '' },
    tags:        { type: 'string', default: '' },
    category:    { type: 'string', default: '27' }, // 27 = Education
    privacy:     { type: 'string', default: 'public' },
    thumbnail:   { type: 'string', default: '' },
    dry_run:     { type: 'boolean', default: false },
  },
});

const CLIENT_ID     = process.env.YOUTUBE_CLIENT_ID;
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.YOUTUBE_REFRESH_TOKEN;

if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
  console.error('Missing YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, or YOUTUBE_REFRESH_TOKEN');
  process.exit(1);
}

async function getAccessToken() {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  if (!r.ok) throw new Error(`Token refresh failed: ${await r.text()}`);
  const { access_token } = await r.json();
  return access_token;
}

async function uploadVideo({ filePath, title, description, tags, categoryId, privacyStatus, thumbnail }) {
  const accessToken = await getAccessToken();
  const fileSize = statSync(filePath).size;
  console.log(`Uploading ${filePath} (${Math.round(fileSize / 1024 / 1024)}MB)...`);

  // Step 1: Initialize resumable upload
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
        snippet: {
          title,
          description,
          tags: tags ? tags.split(',').map(t => t.trim()) : [],
          categoryId,
        },
        status: { privacyStatus },
      }),
    }
  );
  if (!initResp.ok) throw new Error(`Init failed: ${await initResp.text()}`);
  const uploadUrl = initResp.headers.get('Location');
  console.log('Upload URL obtained');

  // Step 2: Upload file
  const { Readable } = await import('stream');
  const fileStream = createReadStream(filePath);
  const chunks = [];
  for await (const chunk of fileStream) chunks.push(chunk);
  const fileBuffer = Buffer.concat(chunks);

  const uploadResp = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'video/mp4',
      'Content-Length': fileSize,
    },
    body: fileBuffer,
  });
  if (!uploadResp.ok && uploadResp.status !== 201) throw new Error(`Upload failed: ${await uploadResp.text()}`);
  const video = await uploadResp.json();
  const videoId = video.id;
  console.log(`Uploaded! Video ID: ${videoId}`);
  console.log(`URL: https://youtu.be/${videoId}`);

  // Step 3: Upload thumbnail if provided
  if (thumbnail && videoId) {
    const thumbResp = await fetch(thumbnail);
    const thumbBuffer = Buffer.from(await thumbResp.arrayBuffer());
    await fetch(
      `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}&uploadType=media`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'image/jpeg',
          'Content-Length': thumbBuffer.length,
        },
        body: thumbBuffer,
      }
    );
    console.log('Thumbnail set');
  }

  return { videoId, url: `https://youtu.be/${videoId}` };
}

if (values.dry_run) {
  console.log('Dry run — would upload:', values.title, 'from', values.file);
  process.exit(0);
}

if (!values.file || !values.title) {
  console.error('--file and --title are required');
  process.exit(1);
}

const result = await uploadVideo({
  filePath: values.file,
  title: values.title,
  description: values.description,
  tags: values.tags,
  categoryId: values.category,
  privacyStatus: values.privacy,
  thumbnail: values.thumbnail,
});

console.log(JSON.stringify(result));
