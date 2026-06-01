// ---------------------------------------------------------------------------
// pipeline.ts — the production render pipeline (Cloud Run only).
//
// Turns the proven render-video.yml step sequence into an in-process pipeline:
//   1. assemble EnergyBlueprintProps from the resolved `blueprint` segment;
//   2. render an MP4 with Remotion;
//   3. ffmpeg re-encode (H.264 baseline + AAC) for Stream/browser compat;
//   4. upload the MP4 to R2 (S3 API) → a public-fetchable URL;
//   5. copy it into Cloudflare Stream as a PRIVATE asset (requireSignedURLs,
//      D1) via `uploadPrivateFromUrl`;
//   6. poll until the Stream asset is `ready`; return uid + duration.
//
// Every external call is wrapped with explicit error handling; any failure
// rejects so the handler emits a signed `failed` callback. The asset is private
// throughout — selfprime mints signed playback tokens later (D1). Node-only
// (Remotion + ffmpeg + fs); excluded from unit coverage and run live on Cloud
// Run. The word "AI" never appears here.
// ---------------------------------------------------------------------------

import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import {
  getStreamVideo,
  uploadPrivateFromUrl,
  type VideoEnv,
} from '@latimer-woods-tech/video';
import {
  buildBlueprintProps,
  ENERGY_BLUEPRINT_FRAMES,
  VIDEO_FPS,
  type BlueprintSourceData,
} from '@latimer-woods-tech/video-studio';
import type { RenderRequest } from '@latimer-woods-tech/video';
import type { RenderOutcome, RenderPipeline } from './index.js';
import { findBlueprintSegment } from './index.js';
import { renderBlueprintMp4 } from './render.js';
import { generateNarrationMp3 } from './tts.js';

/** Runtime configuration the production pipeline needs (from Secret Manager). */
export interface PipelineConfig {
  /** Cloudflare account id + Stream API token (VideoEnv). */
  video: VideoEnv;
  /** R2 (S3-compatible) credentials + bucket for the public-fetchable upload. */
  r2: {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
    /** Public domain serving the bucket (e.g. `media.example.com`). */
    publicDomain: string;
  };
  /** Max seconds to poll Stream for `ready` before failing. Default 600. */
  streamReadyTimeoutSeconds?: number;
  /** Poll interval in seconds. Default 10. */
  streamPollIntervalSeconds?: number;
  /**
   * ElevenLabs credentials for narration synthesis. When present and the
   * segment carries `narrationText`, the pipeline generates an MP3, uploads it
   * to R2, and sets `props.narrationUrl` so `<Audio>` fires in the render.
   * When absent, the pipeline silently skips TTS (a silent render is still
   * valid — the narration is a WOW-enhancer, not a gating requirement).
   */
  elevenLabs?: {
    apiKey: string;
    voiceId: string;
  };
  /**
   * Sybil music library base URL — public R2 domain serving
   * `sybil-music/{type|forge|close}/xxx.mp3`. When present, the pipeline mixes
   * a type-appropriate ambient bed under the narration during the ffmpeg step.
   * When absent, audio is narration-only (graceful degrade).
   */
  musicBaseUrl?: string;
}

/**
 * Maps an HD energy type to its Sybil music track key under `sybil-music/`.
 * Falls back to `type/generator` for unknown values.
 */
const TYPE_MUSIC: Record<string, string> = {
  generator:             'type/generator',
  manifesting_generator: 'type/manifesting_generator',
  projector:             'type/projector',
  manifestor:            'type/manifestor',
  reflector:             'type/reflector',
};

/**
 * Maps a forge theme to its Sybil music track key.
 * The type track is used when no forge override is present.
 */
const FORGE_MUSIC: Record<string, string> = {
  chronos: 'forge/chronos',
  eros:    'forge/eros',
  aether:  'forge/aether',
  lux:     'forge/lux',
  phoenix: 'forge/phoenix',
  self:    'forge/self',
};

/**
 * Resolve the best music track URL for a render. Forge theme wins over type
 * (more specific mood). Falls back gracefully if base URL is absent.
 */
function resolveMusicUrl(
  baseUrl: string | undefined,
  hdType: string | undefined,
  forgeTheme: string | undefined,
): string | null {
  if (!baseUrl) return null;
  const key =
    (forgeTheme && FORGE_MUSIC[forgeTheme]) ??
    (hdType && TYPE_MUSIC[hdType]) ??
    TYPE_MUSIC['generator'];
  return `${baseUrl.replace(/\/$/, '')}/${key}.mp3`;
}

/** @internal Sleep for `seconds`. */
function sleep(seconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

/**
 * @internal Re-encode the rendered MP4 with an ambient music bed mixed under
 * the narration. The music is fetched from a public R2 URL, trimmed/looped to
 * the film length, ducked to -18 dBFS so narration sits clearly on top, then
 * amixed with the primary audio track. Falls back silently to narration-only
 * if the music URL can't be fetched — music is a WOW enhancer, not required.
 */
async function ffmpegReencodeWithMusic(
  input: string,
  output: string,
  musicUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  // Download the music to a temp file so ffmpeg can seek/loop it.
  const musicPath = `${input}.music.mp3`;
  try {
    const res = await fetchImpl(musicUrl);
    if (!res.ok) throw new Error(`music fetch HTTP ${String(res.status)}`);
    const buf = await res.arrayBuffer();
    const { writeFileSync } = await import('node:fs');
    writeFileSync(musicPath, Buffer.from(buf));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[pipeline] music fetch failed (${msg}) — encoding without music`);
    return ffmpegReencode(input, output);
  }

  // amix: narration (0.9 weight) + ambient bed (-18 dBFS = 0.13 weight), looped
  // to film duration. `shortest=1` ensures output matches video length.
  return new Promise((resolve, reject) => {
    const proc = spawn(
      'ffmpeg',
      [
        '-y',
        '-i', input,
        '-stream_loop', '-1', '-i', musicPath,
        '-filter_complex',
        '[0:a]volume=0.9[narr];[1:a]volume=0.13[bed];[narr][bed]amix=inputs=2:duration=shortest[aout]',
        '-map', '0:v',
        '-map', '[aout]',
        '-c:v', 'libx264',
        '-profile:v', 'baseline',
        '-level', '3.0',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '128k',
        output,
      ],
      { stdio: ['ignore', 'inherit', 'inherit'] },
    );
    proc.on('error', (err) => { reject(new Error(`ffmpeg spawn failed: ${err.message}`)); });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg music-mix exited with code ${String(code)}`));
    });
  });
}

/** @internal Run ffmpeg to re-encode to H.264 baseline + AAC; rejects on non-zero exit. */
function ffmpegReencode(input: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      'ffmpeg',
      [
        '-y',
        '-i',
        input,
        '-c:v',
        'libx264',
        '-profile:v',
        'baseline',
        '-level',
        '3.0',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        output,
      ],
      { stdio: ['ignore', 'inherit', 'inherit'] },
    );
    proc.on('error', (err) => {
      reject(new Error(`ffmpeg spawn failed: ${err.message}`));
    });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${String(code)}`));
    });
  });
}

/** @internal Narrow the resolved blueprint segment's props to BlueprintSourceData. */
function toBlueprintSourceData(
  props: Record<string, unknown>,
  narrationText: string,
): BlueprintSourceData {
  // selfprime resolves `blueprint` + brand fields into the segment props; the
  // narration text is authored by selfprime (D6) and rides the segment.
  const blueprint = props['blueprint'];
  if (typeof blueprint !== 'object' || blueprint === null) {
    throw new Error(
      'blueprint segment props.blueprint is missing or not an object',
    );
  }
  const data: BlueprintSourceData = {
    blueprint: blueprint as BlueprintSourceData['blueprint'],
    narrationText,
  };
  if (typeof props['topic'] === 'string') data.topic = props['topic'];
  if (typeof props['brandColor'] === 'string')
    data.brandColor = props['brandColor'];
  if (typeof props['logoUrl'] === 'string') data.logoUrl = props['logoUrl'];
  if (typeof props['narrationUrl'] === 'string')
    data.narrationUrl = props['narrationUrl'];
  return data;
}

/**
 * Builds the production {@link RenderPipeline} bound to `config`. The returned
 * function is what `createApp` invokes for each verified request.
 */
export function createRenderPipeline(config: PipelineConfig): RenderPipeline {
  const pollTimeout = config.streamReadyTimeoutSeconds ?? 600;
  const pollInterval = config.streamPollIntervalSeconds ?? 10;
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${config.r2.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.r2.accessKeyId,
      secretAccessKey: config.r2.secretAccessKey,
    },
  });

  return async function pipeline(
    request: RenderRequest,
  ): Promise<RenderOutcome> {
    const segment = findBlueprintSegment(request);
    if (!segment) {
      throw new Error('request has no blueprint segment to render');
    }
    const sourceData = toBlueprintSourceData(
      segment.props,
      segment.narrationText,
    );
    // Apply the request-level brand overrides if the segment did not carry them.
    if (request.spec.brandColor && !sourceData.brandColor) {
      sourceData.brandColor = request.spec.brandColor;
    }
    if (request.spec.logoUrl && !sourceData.logoUrl) {
      sourceData.logoUrl = request.spec.logoUrl;
    }
    const props = buildBlueprintProps(sourceData);

    // 1b. TTS narration — generate MP3 and upload to R2 so <Audio> fires in
    //     the render. Graceful-degrade: if TTS fails (missing credentials,
    //     ElevenLabs error, R2 upload failure) we log the error and continue
    //     with an empty narrationUrl. A silent render is always better than no
    //     render, and the narration is a WOW-enhancer not a gating requirement.
    if (config.elevenLabs && sourceData.narrationText) {
      try {
        const mp3Bytes = await generateNarrationMp3({
          text: sourceData.narrationText,
          voiceId: config.elevenLabs.voiceId,
          apiKey: config.elevenLabs.apiKey,
        });
        const narrationKey = `narrations/${request.videoObjectId}.mp3`;
        await s3.send(
          new PutObjectCommand({
            Bucket: config.r2.bucket,
            Key: narrationKey,
            Body: mp3Bytes,
            ContentType: 'audio/mpeg',
          }),
        );
        props.narrationUrl = `https://${config.r2.publicDomain}/${narrationKey}`;
        console.log(
          `[render] ${request.videoObjectId} narration uploaded: ${props.narrationUrl}`,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const errorClass =
          err instanceof Error
            ? (err.constructor?.name ?? 'Error')
            : 'Error';
        console.error(
          `[render] TTS failed (${errorClass}): ${message}`,
        );
        // narrationUrl stays '' — render proceeds silently.
      }
    }

    const workDir = await mkdtemp(join(tmpdir(), 'render-'));
    const rawMp4 = join(workDir, 'render.mp4');
    const finalMp4 = join(workDir, 'render-final.mp4');
    try {
      // 2. Remotion render.
      await renderBlueprintMp4(props, rawMp4);
      // 3. ffmpeg re-encode — with ambient music bed if configured.
      const musicUrl = resolveMusicUrl(
        config.musicBaseUrl,
        sourceData.blueprint?.hdType,
        sourceData.blueprint?.forge,
      );
      if (musicUrl) {
        await ffmpegReencodeWithMusic(rawMp4, finalMp4, musicUrl);
      } else {
        await ffmpegReencode(rawMp4, finalMp4);
      }

      // 4. Upload to R2 → public-fetchable URL (Stream copies from a URL).
      const key = `personal-renders/${request.videoObjectId}.mp4`;
      try {
        await s3.send(
          new PutObjectCommand({
            Bucket: config.r2.bucket,
            Key: key,
            Body: createReadStream(finalMp4),
            ContentType: 'video/mp4',
          }),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`R2 upload failed: ${message}`);
      }
      const publicUrl = `https://${config.r2.publicDomain}/${key}`;

      // 5. Copy into Cloudflare Stream as a PRIVATE asset (D1).
      const video = await uploadPrivateFromUrl(
        publicUrl,
        { videoObjectId: request.videoObjectId, userId: request.userId },
        config.video,
      );

      // 6. Poll until ready.
      const streamUid = video.uid;
      const deadline = Date.now() + pollTimeout * 1000;
      let durationSeconds = video.duration > 0 ? video.duration : 0;
      let ready = video.readyToStream;
      while (!ready && Date.now() < deadline) {
        await sleep(pollInterval);
        const current = await getStreamVideo(streamUid, config.video);
        if (current.status.state === 'error') {
          throw new Error(
            `Stream encoding failed: ${current.status.errorReasonText ?? 'unknown'}`,
          );
        }
        if (current.readyToStream) {
          ready = true;
          durationSeconds = current.duration > 0 ? current.duration : 0;
        }
      }
      if (!ready) {
        throw new Error(
          `Stream asset ${streamUid} did not reach ready within ${String(pollTimeout)}s`,
        );
      }

      // Fall back to the known composition length if Stream reports 0.
      if (durationSeconds <= 0) {
        durationSeconds = ENERGY_BLUEPRINT_FRAMES / VIDEO_FPS;
      }

      return { streamUid, durationSeconds };
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  };
}
