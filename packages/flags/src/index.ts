/**
 * @latimer-woods-tech/flags
 *
 * Typed Cloudflare Flagship wrapper: naming enforcement, D1 telemetry, mock client.
 *
 * Quick start:
 *   const flags = createFlagClient(env, { app: 'humandesign', env: env.ENVIRONMENT });
 *   const ok = await flags.boolean('humandesign:ro:profile_generate_v2', false);
 */
export type { FlagKey, FlagContext, FlagsEnv, FlagClient, FlagsbindingType } from './types.js';
import type { FlagContext, FlagsEnv, FlagClient, FlagKey } from './types.js';
import { recordEvaluation } from './telemetry.js';

const FLAG_KEY_RE = /^(global|[a-z][a-z0-9-]*):(ks|ro|ex|cfg|ops):[a-z][a-z0-9_]{0,50}$/;

function guard(key: string, env: string): void {
  if (!FLAG_KEY_RE.test(key)) {
    const msg = '[flags] Invalid key: ' + JSON.stringify(key) + '. Expected {scope}:{ks|ro|ex|cfg|ops}:{name}';
    if (env === 'production') console.warn(msg); else throw new Error(msg);
  }
}

function ctx(c: FlagContext): Record<string, unknown> {
  const o: Record<string, unknown> = { app: c.app, env: c.env };
  if (c.userId) o.userId = c.userId;
  if (c.plan) o.plan = c.plan;
  if (c.attributes) Object.assign(o, c.attributes);
  return o;
}

/** Milliseconds before a Flagship API call is abandoned and the fallback is returned. */
const FLAGSHIP_TIMEOUT_MS = 5_000;

/**
 * Race a Flagship binding call against a hard timeout so Workers never hang waiting for the API.
 * On timeout the AbortError is re-thrown so the caller's catch returns the fallback.
 */
function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      AbortSignal.timeout(FLAGSHIP_TIMEOUT_MS).addEventListener('abort', () =>
        reject(new DOMException('Flagship call timed out', 'AbortError'))
      )
    ),
  ]);
}

/** @public */
export function createFlagClient(workerEnv: FlagsEnv, context: FlagContext): FlagClient {
  const fctx = ctx(context);
  const envStr = workerEnv.ENVIRONMENT ?? context.env;

  return {
    boolean: async (key, fallback) => {
      guard(key, envStr);
      let r = fallback, hit = true;
      try {
        r = await withTimeout(workerEnv.FLAGS.getBooleanValue(key, fallback, fctx));
        hit = r === fallback;
      } catch (e) {
        console.warn('[flags] boolean(' + key + ') Flagship call failed, returning fallback:', e instanceof Error ? e.message : String(e));
        r = fallback; hit = true;
      }
      recordEvaluation(workerEnv.FLAG_TELEMETRY, key, context, r, hit);
      return r;
    },
    killSwitch: async (key) => {
      guard(key, envStr);
      let r = true, hit = true;
      try {
        r = await withTimeout(workerEnv.FLAGS.getBooleanValue(key, true, fctx));
        hit = r === true;
      } catch (e) {
        console.warn('[flags] killSwitch(' + key + ') Flagship call failed, returning fallback:', e instanceof Error ? e.message : String(e));
        r = true; hit = true;
      }
      recordEvaluation(workerEnv.FLAG_TELEMETRY, key, context, r, hit);
      return r;
    },
    string: async (key, fallback) => {
      guard(key, envStr);
      let r = fallback, hit = true;
      try {
        r = await withTimeout(workerEnv.FLAGS.getStringValue(key, fallback, fctx));
        hit = r === fallback;
      } catch (e) {
        console.warn('[flags] string(' + key + ') Flagship call failed, returning fallback:', e instanceof Error ? e.message : String(e));
        r = fallback; hit = true;
      }
      recordEvaluation(workerEnv.FLAG_TELEMETRY, key, context, r, hit);
      return r;
    },
    number: async (key, fallback) => {
      guard(key, envStr);
      let r = fallback, hit = true;
      try {
        r = await withTimeout(workerEnv.FLAGS.getNumberValue(key, fallback, fctx));
        hit = r === fallback;
      } catch (e) {
        console.warn('[flags] number(' + key + ') Flagship call failed, returning fallback:', e instanceof Error ? e.message : String(e));
        r = fallback; hit = true;
      }
      recordEvaluation(workerEnv.FLAG_TELEMETRY, key, context, r, hit);
      return r;
    },
    json: async <T>(key: FlagKey, fallback: T): Promise<T> => {
      guard(key, envStr);
      let r = fallback, hit = true;
      try {
        r = await withTimeout(workerEnv.FLAGS.getJSONValue<T>(key, fallback, fctx));
        hit = JSON.stringify(r) === JSON.stringify(fallback);
      } catch (e) {
        console.warn('[flags] json(' + key + ') Flagship call failed, returning fallback:', e instanceof Error ? e.message : String(e));
        r = fallback; hit = true;
      }
      recordEvaluation(workerEnv.FLAG_TELEMETRY, key, context, r, hit);
      return r;
    },
  };
}

/** @public */
export async function evaluate(workerEnv: FlagsEnv, key: FlagKey, fallback: boolean, context: FlagContext): Promise<boolean> {
  return createFlagClient(workerEnv, context).boolean(key, fallback);
}
