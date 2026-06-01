/**
 * Shared AbortController-based timeout utility for Cloudflare Workers.
 * @param promise  The promise to race against the timeout.
 * @param ms       Milliseconds before the timeout fires.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  const timeout = new Promise<never>((_, reject) =>
    controller.signal.addEventListener('abort', () =>
      reject(new Error(`[flags] operation timed out after ${ms} ms`))
    )
  );
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}
