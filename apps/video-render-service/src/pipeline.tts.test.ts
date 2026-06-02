// Unit tests for the TTS wiring in pipeline.ts.
//
// We test the observable behaviour: when ElevenLabs creds + narrationText are
// present, `props.narrationUrl` is populated before the Remotion render; when
// TTS throws, `narrationUrl` stays empty and the render continues
// (graceful-degrade). Neither Remotion, ffmpeg, R2, nor Cloudflare Stream is
// invoked — all heavy dependencies are mocked at the module boundary.
//
// The tests import the INTERNAL pipeline factory and replace only the TTS
// + R2 seams so we can assert on the side-effects without real network calls.

import { describe, it, expect, vi } from 'vitest';
import * as ttsModule from './tts.js';
import { createRenderPipeline, type PipelineConfig } from './pipeline.js';
import type { RenderRequest } from '@latimer-woods-tech/video';

// The contract version mocked above — keep in sync with the mock.
const RENDER_CONTRACT_VERSION = 2;

// ---------------------------------------------------------------------------
// Mock heavy Cloud-Run-only modules so the test suite runs in Node without
// Remotion, ffmpeg, or real AWS clients.
// ---------------------------------------------------------------------------

vi.mock('./render.js', () => ({
  renderBlueprintMp4: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => {
    const emitter = {
      on: (event: string, cb: (arg?: unknown) => void) => {
        if (event === 'close') cb(0);
        return emitter;
      },
    };
    return emitter;
  }),
}));

vi.mock('node:fs/promises', () => ({
  mkdtemp: vi.fn().mockResolvedValue('/tmp/render-test'),
  rm: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('node:fs', () => ({
  createReadStream: vi.fn().mockReturnValue('fake-stream'),
}));

vi.mock('@aws-sdk/client-s3', () => {
  const PutObjectCommand = vi.fn();
  const S3Client = vi.fn().mockImplementation(() => ({
    send: vi.fn().mockResolvedValue({}),
  }));
  return { S3Client, PutObjectCommand };
});

vi.mock('@latimer-woods-tech/video', () => ({
  RENDER_CONTRACT_VERSION: 2,
  uploadPrivateFromUrl: vi
    .fn()
    .mockResolvedValue({ uid: 'stream_uid_test', duration: 75, readyToStream: true }),
  getStreamVideo: vi.fn().mockResolvedValue({
    status: { state: 'ready' },
    readyToStream: true,
    duration: 75,
  }),
  // Provide enough of the contract for the handler to function
  signRenderPayload: vi.fn(),
  verifyRenderSignature: vi.fn(),
}));

vi.mock('@latimer-woods-tech/video-studio', () => ({
  ENERGY_BLUEPRINT_FRAMES: 900,
  VIDEO_FPS: 30,
  buildBlueprintProps: vi.fn().mockImplementation((sourceData: unknown) => ({
    narrationUrl: '',
    ...(typeof sourceData === 'object' && sourceData !== null ? sourceData : {}),
  })),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildRenderRequest(narrationText = 'You were built to guide.'): RenderRequest {
  return {
    version: RENDER_CONTRACT_VERSION,
    videoObjectId: 'vo_tts_test',
    userId: 'u_1',
    callbackUrl: 'https://api.selfprime.net/api/internal/video/callback',
    spec: {
      sources: ['blueprint'],
      format: 'full_film',
      segments: [
        {
          source: 'blueprint',
          cacheable: false,
          props: {
            blueprint: { hdType: 'projector', definedCenters: ['G'] },
          },
          narrationText,
        },
      ],
    },
  };
}

function baseConfig(): PipelineConfig {
  return {
    video: {
      CF_ACCOUNT_ID: 'cf_acct',
      CF_STREAM_TOKEN: 'cf_tok',
    },
    r2: {
      accountId: 'r2_acct',
      accessKeyId: 'r2_key',
      secretAccessKey: 'r2_secret',
      bucket: 'my-bucket',
      publicDomain: 'media.example.com',
    },
    streamReadyTimeoutSeconds: 5,
    streamPollIntervalSeconds: 0,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('pipeline TTS wiring — TTS succeeds', () => {
  it('sets props.narrationUrl when elevenLabs config + narrationText are present', async () => {
    const mp3Bytes = new Uint8Array([0xff, 0xfb, 0x00]);
    const generateSpy = vi
      .spyOn(ttsModule, 'generateNarrationMp3')
      .mockResolvedValue(mp3Bytes);

    // Capture what narrationUrl the render receives by intercepting renderBlueprintMp4.
    const renderModule = await import('./render.js');
    let capturedNarrationUrl: unknown = 'NOT_SET';
    vi.mocked(renderModule.renderBlueprintMp4).mockImplementation((props) => {
      capturedNarrationUrl = (props as Record<string, unknown>)['narrationUrl'];
      return Promise.resolve();
    });

    const pipeline = createRenderPipeline({
      ...baseConfig(),
      elevenLabs: { apiKey: 'el_key', voiceId: 'el_voice' },
    });

    await pipeline(buildRenderRequest());

    expect(generateSpy).toHaveBeenCalledOnce();
    expect(generateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'You were built to guide.',
        voiceId: 'el_voice',
        apiKey: 'el_key',
      }),
    );

    // The narrationUrl was set to the R2 public URL before the render ran.
    expect(capturedNarrationUrl).toMatch(
      /^https:\/\/media\.example\.com\/narrations\/vo_tts_test\.mp3$/,
    );

    generateSpy.mockRestore();
  });
});

describe('pipeline TTS wiring — TTS fails (graceful-degrade)', () => {
  it('continues the render with empty narrationUrl when generateNarrationMp3 throws', async () => {
    const generateSpy = vi
      .spyOn(ttsModule, 'generateNarrationMp3')
      .mockRejectedValue(new Error('ElevenLabs TTS returned HTTP 500'));

    const renderModule = await import('./render.js');
    let capturedNarrationUrl: unknown = 'NOT_SET';
    vi.mocked(renderModule.renderBlueprintMp4).mockImplementation((props) => {
      capturedNarrationUrl = (props as Record<string, unknown>)['narrationUrl'];
      return Promise.resolve();
    });

    const pipeline = createRenderPipeline({
      ...baseConfig(),
      elevenLabs: { apiKey: 'el_key', voiceId: 'el_voice' },
    });

    // Should not throw — render proceeds silently.
    const outcome = await pipeline(buildRenderRequest());
    expect(outcome.streamUid).toBe('stream_uid_test');

    // narrationUrl was empty (not set) when the render ran.
    expect(capturedNarrationUrl).toBe('');

    generateSpy.mockRestore();
  });

  it('skips TTS entirely when elevenLabs config is absent', async () => {
    const generateSpy = vi.spyOn(ttsModule, 'generateNarrationMp3');

    const pipeline = createRenderPipeline(baseConfig()); // no elevenLabs
    await pipeline(buildRenderRequest());

    expect(generateSpy).not.toHaveBeenCalled();
    generateSpy.mockRestore();
  });

  it('skips TTS when narrationText is empty even if elevenLabs config is present', async () => {
    const generateSpy = vi.spyOn(ttsModule, 'generateNarrationMp3');

    const pipeline = createRenderPipeline({
      ...baseConfig(),
      elevenLabs: { apiKey: 'k', voiceId: 'v' },
    });
    await pipeline(buildRenderRequest('')); // empty narrationText

    expect(generateSpy).not.toHaveBeenCalled();
    generateSpy.mockRestore();
  });
});
