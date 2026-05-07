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

export function createFlagClient(workerEnv: FlagsEnv, context: FlagContext): FlagClient {
  const fctx = ctx(context);
  const envStr = workerEnv.ENVIRONMENT ?? context.env;

  return {
    boolean: async (key, fallback) => {
      guard(key, envStr);
      let r = fallback, hit = true;
      try { r = await workerEnv.FLAGS.getBooleanValue(key, fallback, fctx); hit = r === fallback; } catch {}
      recordEvaluation(workerEnv.FLAG_TELEMETRY, key, context, r, hit);
      return r;
    },
    killSwitch: async (key) => {
      guard(key, envStr);
      let r = true, hit = true;
      try { r = await workerEnv.FLAGS.getBooleanValue(key, true, fctx); hit = r === true; } catch {}
      recordEvaluation(workerEnv.FLAG_TELEMETRY, key, context, r, hit);
      return r;
    },
    string: async (key, fallback) => {
      guard(key, envStr);
      let r = fallback, hit = true;
      try { r = await workerEnv.FLAGS.getStringValue(key, fallback, fctx); hit = r === fallback; } catch {}
      recordEvaluation(workerEnv.FLAG_TELEMETRY, key, context, r, hit);
      return r;
    },
    number: async (key, fallback) => {
      guard(key, envStr);
      let r = fallback, hit = true;
      try { r = await workerEnv.FLAGS.getNumberValue(key, fallback, fctx); hit = r === fallback; } catch {}
      recordEvaluation(workerEnv.FLAG_TELEMETRY, key, context, r, hit);
      return r;
    },
    json: async (key, fallback) => {
      guard(key, envStr);
      let r = fallback, hit = true;
      try { r = await workerEnv.FLAGS.getJSONValue(key, fallback, fctx); hit = JSON.stringify(r) === JSON.stringify(fallback); } catch {}
      recordEvaluation(workerEnv.FLAG_TELEMETRY, key, context, r, hit);
      return r;
    },
  };
}

export async function evaluate(workerEnv: FlagsEnv, key: FlagKey, fallback: boolean, context: FlagContext): Promise<boolean> {
  return createFlagClient(workerEnv, context).boolean(key, fallback);
}
