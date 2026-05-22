/**
 * One-time YouTube OAuth2 setup script.
 * Run this once to get a refresh token, then store it as YOUTUBE_REFRESH_TOKEN in GCP.
 * 
 * Setup steps:
 * 1. Go to https://console.cloud.google.com/apis/credentials?project=factory-495015
 * 2. Click "+ CREATE CREDENTIALS" → "OAuth client ID"
 * 3. Application type: "Desktop app", Name: "Factory YouTube Uploader"
 * 4. Download the JSON — get client_id and client_secret from it
 * 5. Store them in GCP:
 *    printf '%s' '<client_id>' | gcloud secrets create YOUTUBE_CLIENT_ID --data-file=- --project=factory-495015
 *    printf '%s' '<client_secret>' | gcloud secrets create YOUTUBE_CLIENT_SECRET --data-file=- --project=factory-495015
 * 6. Run: YOUTUBE_CLIENT_ID=<id> YOUTUBE_CLIENT_SECRET=<secret> node scripts/youtube-oauth-setup.mjs
 * 7. Visit the URL, authorize, paste the code back
 * 8. The script will print your refresh token — store it:
 *    printf '%s' '<refresh_token>' | gcloud secrets create YOUTUBE_REFRESH_TOKEN --data-file=- --project=factory-495015
 */

import { createServer } from 'http';

const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
const REDIRECT = 'http://localhost:8888/callback';
const SCOPES = 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET');
  process.exit(1);
}

const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + new URLSearchParams({
  client_id: CLIENT_ID,
  redirect_uri: REDIRECT,
  response_type: 'code',
  scope: SCOPES,
  access_type: 'offline',
  prompt: 'consent',
});

console.log('\n=== YouTube OAuth Setup ===');
console.log('1. Open this URL in your browser:');
console.log('\n' + authUrl + '\n');
console.log('2. Authorize the app');
console.log('3. Waiting for callback on http://localhost:8888/callback...\n');

// Start local server to catch the OAuth callback
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:8888');
  const code = url.searchParams.get('code');
  if (!code) { res.end('No code'); return; }
  
  res.end('<html><body><h2>Authorization successful! Check your terminal for the refresh token.</h2></body></html>');
  server.close();
  
  // Exchange code for tokens
  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT, grant_type: 'authorization_code',
    }),
  });
  const tokens = await tokenResp.json();
  
  console.log('=== SUCCESS ===');
  console.log('Refresh token:', tokens.refresh_token);
  console.log('\nStore it in GCP:');
  console.log(`printf '%s' '${tokens.refresh_token}' | gcloud secrets create YOUTUBE_REFRESH_TOKEN --data-file=- --project=factory-495015`);
}).listen(8888);
