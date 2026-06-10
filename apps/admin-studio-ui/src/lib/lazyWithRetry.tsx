/**
 * `React.lazy` wrapper that survives stale-deploy chunk failures.
 *
 * After a deploy, a browser still running the previous build holds an
 * `index.html` that references hashed chunk filenames which no longer exist on
 * the origin. The first dynamic `import()` of such a chunk then rejects with
 * `TypeError: Importing a module script failed` /
 * `Failed to fetch dynamically imported module` — surfaced in Sentry as
 * admin-studio-ui #1476 (route `/overview`). Because the tab `<Suspense>` has no
 * error boundary, that rejection bubbles out and the tab never renders.
 *
 * Recovery: on the first such failure, force one full reload so the browser
 * fetches the fresh `index.html` + chunk manifest. A `sessionStorage` flag
 * guards against an infinite reload loop — if the import still fails after a
 * reload (a genuinely broken build, not a stale client), the error is rethrown
 * so it reaches Sentry as before.
 */
import { lazy } from 'react';
import type { ComponentType, LazyExoticComponent } from 'react';

const RELOAD_FLAG = 'asui:chunk-reloaded';

/** Heuristic: is this the stale-chunk / failed-dynamic-import error class? */
function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /importing a module script failed/i.test(msg) ||
    /failed to fetch dynamically imported module/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /'?text\/html'? is not a valid javascript mime type/i.test(msg)
  );
}

export function lazyWithRetry<P extends object>(
  factory: () => Promise<{ default: ComponentType<P> }>,
): LazyExoticComponent<ComponentType<P>> {
  return lazy(async () => {
    try {
      const mod = await factory();
      // Successful load — clear the guard so a future stale deploy can retry.
      try { window.sessionStorage.removeItem(RELOAD_FLAG); } catch { /* no-op */ }
      return mod;
    } catch (err) {
      let alreadyReloaded = false;
      try { alreadyReloaded = window.sessionStorage.getItem(RELOAD_FLAG) === '1'; } catch { /* no-op */ }

      if (isChunkLoadError(err) && !alreadyReloaded) {
        try { window.sessionStorage.setItem(RELOAD_FLAG, '1'); } catch { /* no-op */ }
        window.location.reload();
        // Keep the Suspense fallback up until the reload navigates away.
        return new Promise<{ default: ComponentType<P> }>(() => {});
      }
      throw err;
    }
  });
}
