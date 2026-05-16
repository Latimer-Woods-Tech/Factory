# Video Transcoding Runbook

**Last Updated:** April 28, 2026  
**Audience:** Operators, SREs, on-call engineers  
**Related Docs:** [ENGINEERING.md](../apps/videoking/ENGINEERING.md), [Incident Response Playbook](incident-response-playbook.md)

---

## Overview

The video transcoding pipeline processes raw uploaded video files and produces optimized outputs for streaming:

```
Upload → Queue → Transcode (Remotion) → Encode (ffmpeg) → R2 Upload → Stream Registration → Ready
           ↓
        [CloudFlare Cron] → Error Detection → DLQ Entry → Manual Retry
```

**SLO:** 95% of videos transcode to "ready" within 2 hours of upload (p99 < 5 hours)  
**Error Budget:** 5% failure rate allowed before alert triggers

---

## Normal Operations

### 1. Creator Uploads Video

1. Creator clicks "Upload" in dashboard
2. Frontend calls `POST /api/videos` → receives `uploadUrl` + JWT token
3. Browser uploads MP4 to Cloudflare Stream (chunked, resumable)
4. Stream uploads to our R2 bucket at `https://r2.adrper79.workers.dev/uploads/{videoId}/raw.mp4`
5. Webhook fires: `video.uploaded`
6. Worker receives webhook, inserts row into `videos` table with status = `uploading`

**Expected time:** <30 seconds for typical 100MB file

---

### 2. Transcode Job Queued

When upload completes, a Job record is created:

```sql
INSERT INTO video_jobs (id, video_id, job_type, status, attempt, created_at)
VALUES (job_abc123, vid_xyz, 'transcode', 'queued', 1, now());
```

**Job Flow:**
- Job picked up by next available transcoder pool (3–5 workers, auto-scaling)
- Status changes to `processing`
- Estimated time to start: 30 sec – 2 min (depends on queue depth)

---

### 3. Transcoding Execution (Remotion)

Remotion renders a composition client-side, then ffmpeg encodes:

```bash
# Inside a temporary GitHub Actions runner (via dispatch from videoking cron)
remotion render src/compositions/main.tsx \
  --composition VideoPlayer \
  --props '{"videoId":"vid_xyz","uploadUrl":"https://r2.adrper79.workers.dev/uploads/vid_xyz/raw.mp4"}' \
  --width 1920 --height 1080 \
  --frame-range 0 -1 \
  --output /tmp/video.webm \
  --codec h264 \
  --crf 21 \
  --audio-codec aac

# Result: /tmp/video.mp4 (~15-30 min depending on length)
```

**Output Formats:**
- Primary: H.264 baseline @ 5000 kbps (playback compatibility)
- Backup: VP9 @ 3000 kbps (future; not in first release)
- Audio: AAC @ 128 kbps (mono) or 256 kbps (stereo if source)

**Time Estimate:**
- 5 min video → 3–5 min render time
- 60 min video → 25–35 min render time
- Parallelization: multiple videos can transcode simultaneously

---

### 4. Upload to R2

Once ffmpeg completes:

```bash
aws s3 cp /tmp/video.mp4 \
  s3://videoking-r2/videos/{videoId}/transcoded.mp4 \
  --region auto
```

**Parallel uploads:**
- Main MP4 to `videos/{videoId}/transcoded.mp4`
- Thumbnail (frame @ 1s) to `videos/{videoId}/thumbnail.jpg`
- Metadata JSON to `videos/{videoId}/metadata.json`

**Time:** 2–10 min (depends on file size + R2 latency)

---

### 5. Register with Cloudflare Stream

Once R2 upload completes:

```bash
curl -X POST https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/stream \
  -H "Authorization: Bearer ${CF_STREAM_TOKEN}" \
  -F 'file=@/tmp/video.mp4' \
  -F 'requireSignedURLs=true'
```

Response:
```json
{
  "uid": "stream_abc123",
  "rtmps": {
    "streamKey": "...",
    "url": "rtmps://live.cloudflare.com:443/live/"
  },
  "thumbnail": "https://...",
  "duration": 300
}
```

**Record in DB:**
```sql
UPDATE videos
SET status = 'ready', 
    stream_uid = 'stream_abc123',
    transcoded_at = now(),
    duration = 300
WHERE id = 'vid_xyz';
```

**Time:** 30 sec – 2 min

---

### 6. Notify Creator

Once status = `ready`, webhook fires: `video.processing_complete`

Frontend receives webhook, shows "Your video is ready!" in dashboard.

---

## Failure Scenarios & Recovery

### Scenario A: Upload Stalls (Raw Video Never Arrives)

**Detection:**
- Cron job checks for videos stuck in `uploading` status > 30 min
- Alert fires: `WARN: Stalled upload for vid_xyz`

**Recovery:**
1. Check R2 for partial upload: `aws s3 ls s3://videoking-r2/uploads/vid_xyz/`
2. If empty → Storage quota exceeded:
   - Check: `aws s3 ls s3://videoking-r2/ --summarize`
   - If >95% full → Scale R2 (increase capacity or archive old uploads)
   - Tell creator: "Storage full; try again in 30 min"
3. If partial file → Network interrupted:
   - Creator can resume upload from dashboard (browser handles resume)
   - Or manually retry via: `PUT /api/videos/{id}/retry-upload`

**Manual Fix:**
```bash
# Delete incomplete upload from R2
aws s3 rm s3://videoking-r2/uploads/vid_xyz/raw.mp4

# Tell creator to try again (or delete + re-upload)
curl -X PATCH https://videoking.adrper79.workers.dev/api/videos/vid_xyz \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"action": "reset_upload"}'
```

---

### Scenario B: Transcoding Fails (Remotion Crashes)

**Detection:**
```sql
SELECT * FROM video_jobs
WHERE status = 'failed' AND attempt < 3 AND failed_at IS NOT NULL;
```

Common failure causes:
1. **Out of memory** — Video too long or high bitrate
2. **Deepgram timeout** — Speech-to-text service unreachable
3. **ffmpeg codec error** — Corrupted input file

**Logs:** Check GitHub Actions run output
```bash
# Find the run:
gh run list --repo Latimer-Woods-Tech/capricast --workflow render-video.yml --limit 20

# Tail logs:
gh run view <RUN_ID> --log

# Quick pattern: grep for "ERROR" or "fatal"
```

**Recovery:**
```bash
# Retry (automatic):
# Cron job retries 3 times with exponential backoff
# Retry 1: 5 min after fail
# Retry 2: 15 min after fail
# Retry 3: 1 hour after fail

# Manual retry (if <3 attempts):
curl -X POST https://videoking.adrper79.workers.dev/api/admin/dlq-retry \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -d '{"dlqId": "dlq_job_abc123"}'

# Move to DLQ if:
# - Already failed 3 times AND
# - Input file still looks valid (has video stream)
# OR
# - Move to DLQ if all retries exhausted

# Admin action (move to DLQ):
curl -X PATCH https://videoking.adrper79.workers.dev/api/admin/dlq/dlq_job_abc123 \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -d '{"status": "dead", "notes": "3 retries exhausted; manual intervention needed"}'

# Notify creator:
# POST to /api/creator/notifications
# Subject: "Video processing failed"
# Message: "Your video hit an error. Our team is investigating."
```

**Specific Fixes by Error:**

**1. Out of Memory**
```
Error: ffmpeg: memory allocation failed after 5 retries
```
- File is legitimately too large (>5GB or >4 hours)
- Action: Reject with 413 Payload Too Large
- Tell creator: "Max file size is 5GB (4 hours @ quality level X)"

**2. Deepgram Timeout** (speech-to-text for auto-captions)
```
Error: deepgram.timeout: no response after 30s
```
- Speech-to-text service overloaded
- Action: Retry (automatic) — Deepgram has redundancy
- If persistent: Disable auto-captions, allow retry
  ```bash
  curl -X PATCH https://videoking.adrper79.workers.dev/api/admin/video-jobs/job_abc123 \
    -d '{"skip_captions": true}'
  ```

**3. ffmpeg Codec Error**
```
Error: Unknown encoder 'h264'
```
- ffmpeg binary corrupted or missing
- Action: Redeploy transcoder container
  ```bash
  # Force redeployment
  gh workflow run redeploy-transcoders.yml --repo Latimer-Woods-Tech/capricast
  
  # Wait for 3–5 new runners to spin up (~3 min)
  # Cron automatically redistributes queued jobs
  ```

**4. Corrupted Input File**
```
Error: av_read_frame: no frame data found
```
- Creator uploaded non-video file or truncated file
- Action: Reject with 400 Bad Request
- Tell creator: "File appears corrupted. Try downloading and re-uploading."

---

### Scenario C: R2 Upload Fails

**Detection:**
```sql
SELECT * FROM video_jobs
WHERE status = 'failed' 
  AND error_message LIKE '%R2%'
  AND attempt < 3;
```

**Causes:**
1. R2 authentication expired
2. R2 bucket quota exceeded
3. Network timeout to Cloudflare

**Recovery:**

**If R2 auth expired:**
```bash
# Rotate R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY in GitHub Secrets
# Store new credentials in Neon secret store
# Cron automatically retries with new credentials

# Manual rotation:
sh docs/runbooks/secret-rotation.sh --secret R2_ACCESS_KEY_ID --rotate
```

**If R2 quota exceeded:**
```bash
# Check current usage:
aws s3 ls s3://videoking-r2/ --summarize --human

# Archive old uploads to cold storage:
aws s3 ls s3://videoking-r2/uploads/ --recursive | \
  awk '{print $4}' | \
  xargs -I {} bash -c 'date=$(aws s3api head-object --bucket videoking-r2 --key {} --query LastModified --output text); if [[ "$date" < "2026-02-01" ]]; then aws s3 cp s3://videoking-r2/{} s3://videoking-archive/{} --storage-class GLACIER; fi'

# Or request capacity increase from Cloudflare
# Contact account manager: increase R2 billing tier
```

**If network timeout:**
```bash
# Automatic retry works (exponential backoff)
# If persistent: check Cloudflare status
curl https://www.cloudflarestatus.com

# Manual retry:
curl -X POST https://videoking.adrper79.workers.dev/api/admin/dlq-retry \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -d '{"dlqId": "dlq_job_abc123"}'
```

---

### Scenario D: Stream Registration Fails

**Detection:**
```sql
SELECT * FROM video_jobs
WHERE status = 'failed' 
  AND error_message LIKE '%stream%'
  AND failed_at > now() - interval '1 hour';
```

**Causes:**
1. Cloudflare Stream API rate limited
2. Stream auth token expired
3. Video already exists in Stream (duplicate registration)

**Recovery:**

**If rate limited:**
```bash
# Back off and retry (automatic)
# Stream API limit: 3000 req/hour
# Cron distributes transcodes to stay under limit
```

**If token expired:**
```bash
# Rotate CF_STREAM_TOKEN in GitHub Secrets:
sh docs/runbooks/secret-rotation.sh --secret CF_STREAM_TOKEN --rotate

# Redeploy worker to pick up new token:
wrangler deploy --var CF_STREAM_TOKEN=<NEW_TOKEN>
```

**If duplicate (video already registered):**
```bash
# Query Stream for existing UID:
curl "https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/stream?search={videoId}" \
  -H "Authorization: Bearer ${CF_STREAM_TOKEN}"

# Update DB with existing UID:
UPDATE videos
SET stream_uid = '<EXISTING_UID>'
WHERE id = 'vid_xyz';

# Mark job as succeeded:
UPDATE video_jobs
SET status = 'succeeded', processed_at = now()
WHERE video_id = 'vid_xyz';
```

---

## Observability & Monitoring

### Key Metrics

**Dashboard:** [Videoking Transcoding Metrics](https://analytics.factory.local/dashboards/videoking-transcoding)

| Metric | Alert Threshold | Status |
|--------|-----------------|--------|
| **Processing Success Rate** | <95% for 10 min | Check every 3 min |
| **P99 Duration** | >5 hours | Check every 5 min |
| **Failed Jobs in DLQ** | >10 for 1 hour | Page on-call |
| **Queue Depth** | >500 | Auto-scale transcoder pool |
| **R2 Disk Usage** | >90% | Page on-call (quota issue) |
| **Deepgram Errors** | >5% of requests | Check upstream status |

### Traces & Logs

**View a specific transcode:**
```bash
# Find the job:
curl https://videoking.adrper79.workers.dev/api/admin/video-jobs \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -G --data-urlencode 'videoId=vid_xyz'

# Get logs:
curl https://videoking.adrper79.workers.dev/api/admin/video-jobs/job_abc123/logs \
  -H "Authorization: Bearer <ADMIN_TOKEN>"

# Output:
{
  "jobId": "job_abc123",
  "videoId": "vid_xyz",
  "status": "processing",
  "startedAt": "2026-04-28T10:15:00Z",
  "events": [
    {"time": "10:15:03", "stage": "download", "duration": 45000},
    {"time": "10:16:00", "stage": "remotion_render", "duration": 180000, "fps": 30},
    {"time": "10:19:00", "stage": "ffmpeg_encode", "duration": 120000, "codec": "h264"},
    {"time": "10:21:00", "stage": "r2_upload", "duration": 60000, "bytes": 125000000},
    {"time": "10:22:00", "stage": "stream_register", "status": "in_progress"}
  ]
}
```

**Sentry Errors:**
```
Filter: "release:videoking@1.0.0" AND "transcode" AND "error"
```

Common error groups:
- `RemotionRenderError` — Rendering failure (see Scenario B above)
- `FfmpegCodecError` — Encoding failure
- `R2UploadError` — Storage upload failure
- `StreamRegistrationError` — Cloudflare Stream API failure

---

## Performance Tuning

### Transcoding Speed

**Current baseline:** ~6 min for 5-min video

**Optimization Levers:**

1. **Reduce quality (CRF value)**
   - Current: CRF 21 (visually lossless)
   - Lower CRF = better quality, slower
   - Higher CRF = worse quality, faster
   - Recommendation: Keep 21 for creators; offer "fast" mode (CRF 26) for beta users

2. **Parallel encoding**
   - Current: Single ffmpeg pass
   - GPU acceleration: Use NVIDIA NVENC (if available in runner)
   - CPU cores: Max passes per runner
   ```bash
   # Add to GitHub Actions runner:
   ffmpeg -i input.mp4 -c:v h264_nvenc -preset fast output.mp4
   ```

3. **Canary secondary format**
   - Encode VP9 in parallel with H264
   - Future: Serve VP9 to Chrome/Firefox (faster)
   ```bash
   # Parallel encode (both run concurrently):
   ffmpeg -i input.mp4 -c:v h264 h264.mp4 & 
   ffmpeg -i input.mp4 -c:v vp9 vp9.mp4 & 
   wait
   ```

---

## Escalation

**P1 (Page immediately):**
- Processing success rate <90% for 15 min
- All transcoder workers down
- R2 storage not accessible

**P2 (Slack alert, respond within 1 hour):**
- Processing success rate 90–95%
- >50 jobs stuck in DLQ
- Queue depth >1000

**P3 (Log, handle next business day):**
- Single transcoder pool down (others online)
- Queue depth >500 (resolves within 30 min)

**Contact:**
- On-call: `@oncall-videoking` on Slack
- Escalation: Tech lead (Alex Kim) + Ops lead (Jordan).

---

## Runbooks by Component

| Component | Runbook |
|-----------|---------|
| **GitHub Actions (Remotion/ffmpeg)** | [github-actions-troubleshooting.md](./github-actions-troubleshooting.md) |
| **Deepgram (Captions)** | [deepgram-integration.md](./deepgram-integration.md) |
| **Cloudflare Stream** | [cloudflare-stream-troubleshooting.md](./cloudflare-stream-troubleshooting.md) |
| **R2 Storage** | [r2-storage-troubleshooting.md](./r2-storage-troubleshooting.md) |
| **Incident Response** | [incident-response-playbook.md](./incident-response-playbook.md) |
