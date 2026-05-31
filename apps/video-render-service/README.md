# video-render-service

The **Energy Blueprint Video Engine** render service (I1 Slice 1, Wave 2). A
Node service on **Google Cloud Run** that turns a signed render request into a
**private Cloudflare Stream** asset and reports the result via a signed callback.

> Architecture: [`docs/architecture/I1_PERSONAL_BLUEPRINT_VIDEO.md`](../../docs/architecture/I1_PERSONAL_BLUEPRINT_VIDEO.md)
> — §3 (data flow), §6 (Slice 1), §7 (contracts), decisions **D1** (private +
> signed playback), **D2** (Cloud Run is the executor for *all* personal
> renders), **D10** (signed, idempotent async contract).

This is **not** a Cloudflare Worker. Remotion (headless Chromium) and ffmpeg
need Node.js + real compute, so personal renders run here on Cloud Run. The CI
`render-video.yml` pipeline stays only for scheduled *content* videos — a
different workload.

## What it does

```
selfprime  ──(signed RenderRequest, HMAC)──▶  POST /render
                                                 │ verify signature (D10)
                                                 │ check contract version + blueprint segment
                                                 │ claim videoObjectId (idempotency)
                                                 ▼  202 Accepted
                                    build EnergyBlueprintProps from the
                                    resolved `blueprint` segment
                                                 ▼
                                    Remotion render → MP4
                                                 ▼
                                    ffmpeg re-encode (H.264 baseline + AAC)
                                                 ▼
                                    upload MP4 to R2 (S3 API) → public URL
                                                 ▼
                                    Cloudflare Stream /copy  (PRIVATE — D1)
                                                 ▼  poll until ready
selfprime  ◀──(signed RenderCallback, HMAC)──  POST callbackUrl
                                                 { status: ready|failed, streamUid, durationSeconds }
```

The asset is **private throughout** (`requireSignedURLs`); selfprime mints
short-lived signed playback tokens later (D1). Narration is **authored by
selfprime** (D6) and rides the request — this service never generates narration.
Credit refund/grant logic is selfprime's, driven by the `failed` callback.

## Endpoints

| Method | Path      | Behaviour |
|--------|-----------|-----------|
| `GET`  | `/health` | `200 {"status":"ok"}` |
| `POST` | `/render` | Signed render endpoint (below). Replies `202` and renders + calls back asynchronously. |

### `POST /render` — the signed contract (D10)

Headers: `X-Signature` = `HMAC-SHA256(${timestamp}.${rawBody}, secret)` (hex),
`X-Timestamp` = unix seconds. Body = a `RenderRequest`
(`packages/video/src/render-contract.ts`).

Responses:

| Status | When |
|--------|------|
| `202`  | Verified + accepted; render + callback run async. |
| `401`  | `{ "error": "bad_signature" \| "stale" \| "malformed" }` — signature failed. **Never processed.** |
| `400`  | `unknown_contract_version` / `missing_blueprint_segment` / `malformed_request` / `malformed_json`. |
| `409`  | Duplicate `videoObjectId` already terminal/in-flight (idempotency). |
| `500`  | Internal error. |

Exactly-once is enforced on both sides: this service rejects a duplicate
`videoObjectId` (in-memory per instance), and selfprime (the callback receiver)
must also reject a duplicate already in a terminal state — the single-instance
in-memory guard here is sufficient because the receiver is authoritative.

## Secret matrix (GCP Secret Manager → Cloud Run env)

Injected at deploy time via `--set-secrets` (see `cloudbuild.yaml`). **No secret
is ever in source or in cloudbuild vars.**

| Env var | GCP secret name | Purpose |
|---------|-----------------|---------|
| `VIDEO_RENDER_HMAC_SECRET` | `VIDEO_RENDER_HMAC_SECRET` | Shared HMAC secret for the signed request/callback (D10). |
| `CF_ACCOUNT_ID`            | `CLOUDFLARE_ACCOUNT_ID`   | Cloudflare account id (Stream API). |
| `CF_STREAM_TOKEN`          | `cf-stream-token`         | Cloudflare Stream API token (Stream:Edit + Read). |
| `R2_ACCESS_KEY_ID`         | `r2-access-key-id`        | R2 (S3) access key for the intermediate MP4 upload. |
| `R2_SECRET_ACCESS_KEY`     | `r2-secret-access-key`    | R2 (S3) secret. |
| `R2_BUCKET_NAME`           | `r2-bucket-name`          | R2 bucket the MP4 is staged in. |
| `R2_PUBLIC_DOMAIN`         | `r2-public-domain`        | Public host serving the bucket (Stream copies from this URL). |

Non-secret env (substitution in `cloudbuild.yaml`):

| Env var | Value | Purpose |
|---------|-------|---------|
| `R2_ACCOUNT_ID` | `a1c8a33cbe8a3c9e260480433a0dbb06` | R2 account id (== Cloudflare account id) for the S3 endpoint. |

These names are the exact ones `render-video.yml` already sources from GCP, so
the orchestrator can confirm they exist. The HMAC secret
(`VIDEO_RENDER_HMAC_SECRET`) is the only net-new one and must be created in
`factory-495015` (`printf '%s'`, no trailing newline) and granted to
`factory-sa@factory-495015.iam.gserviceaccount.com`.

## Build & deploy

The service depends on the local `@latimer-woods-tech/*` packages via `file:`,
so the **Docker build context is the repo root** (`cloudbuild.yaml` builds with
`.` and `--file apps/video-render-service/Dockerfile`). The image is the
Playwright base (Chromium + OS libs Remotion needs) plus ffmpeg.

Deploy is **private** (`--no-allow-unauthenticated`): the endpoint is HMAC-gated
and called server-to-server by selfprime, never public.

```bash
# From the repo root (Cloud Build does this for you on the trigger):
gcloud builds submit --config apps/video-render-service/cloudbuild.yaml .
```

> Deploy is the orchestrator's job — do not run it from a worktree.

## Local development

```bash
cd apps/video-render-service
npm install            # also builds video-studio's .d.mts via its install
npm run typecheck      # 0 errors
npm run lint           # eslint --max-warnings 0
npm test               # vitest + coverage (render/upload mocked)
npm run build          # tsup → dist/{index,server}.js
```

The unit tests mock the render pipeline, callback fetch, and idempotency store —
**no real Remotion/ffmpeg/Stream/R2 call** runs locally. A real render only
happens on Cloud Run.

## Manual E2E recipe (run after the orchestrator deploys)

1. **Mint a fixture request + signature** (uses the package's own signer so the
   scheme matches exactly):

   ```bash
   node --input-type=module -e '
   import { signRenderPayload, RENDER_CONTRACT_VERSION } from "@latimer-woods-tech/video";
   const req = {
     version: RENDER_CONTRACT_VERSION,
     videoObjectId: crypto.randomUUID(),
     userId: "u_test",
     callbackUrl: "https://api.selfprime.net/api/internal/video/callback",
     spec: {
       sources: ["blueprint"],
       format: "full_film",
       segments: [{
         source: "blueprint", cacheable: true,
         narrationText: "You were built to guide.",
         props: { blueprint: { hdType: "projector", definedCenters: ["G","Throat"] } }
       }],
       brandColor: "#c9a84c"
     }
   };
   const rawBody = JSON.stringify(req);
   const { signature, timestamp } = await signRenderPayload({ rawBody, secret: process.env.VIDEO_RENDER_HMAC_SECRET });
   console.log(JSON.stringify({ rawBody, signature, timestamp }));
   '
   ```

2. **POST it** to the deployed (private) service with a Cloud Run identity token:

   ```bash
   TOKEN=$(gcloud auth print-identity-token)
   curl -sS -X POST "$SERVICE_URL/render" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -H "X-Signature: $SIGNATURE" \
     -H "X-Timestamp: $TIMESTAMP" \
     --data "$RAW_BODY" -w '\n%{http_code}\n'
   # → 202 {"status":"accepted",...}
   ```

3. **Observe**: a new **private** asset in Cloudflare Stream
   (`requireSignedURLs: true`) tagged with the `videoObjectId`/`userId`, and a
   signed `RenderCallback` POST to `callbackUrl` with
   `{ status: "ready", streamUid, durationSeconds }`. Verify the callback's
   `X-Signature` with `verifyRenderSignature` and the same secret.

   Tamper checks: a bad signature → `401 bad_signature`; a timestamp older than
   ±5 min → `401 stale`; `version` ≠ current → `400`.

## No "AI" in output

Per platform governance, the string "AI" never appears in any log, error, or
output of this service. Narration is selfprime-authored; this service only
renders and reports.
