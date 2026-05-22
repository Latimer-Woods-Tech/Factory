import { describe, expect, it } from 'vitest';
import { FACTORY_APPS, healthUrlFor, manifestUrlFor, workerNameFor } from './app-registry.js';

describe('app-registry', () => {
  it('contains the expected control-plane app set', () => {
    expect(FACTORY_APPS.map((app) => app.id)).toEqual([
      'admin-studio',
      'prime-self',
      'schedule-worker',
      'video-cron',
      'capricast-api',
      'cypher-healing',
    ]);
  });

  it('uses custom domain for production health checks when configured', () => {
    const primeSelf = FACTORY_APPS.find((app) => app.id === 'prime-self');
    expect(primeSelf).toBeTruthy();
    expect(healthUrlFor(primeSelf!, 'production')).toBe('https://api.selfprime.net/health');
    expect(manifestUrlFor(primeSelf!, 'production')).toBe('https://api.selfprime.net/manifest');
  });

  it('uses workers.dev hostnames for staging checks', () => {
    const scheduleWorker = FACTORY_APPS.find((app) => app.id === 'schedule-worker');
    const videoCron = FACTORY_APPS.find((app) => app.id === 'video-cron');
    expect(scheduleWorker).toBeTruthy();
    expect(videoCron).toBeTruthy();

    expect(healthUrlFor(scheduleWorker!, 'staging')).toBe('https://schedule-worker.adrper79.workers.dev/health');
    expect(healthUrlFor(videoCron!, 'staging')).toBe('https://video-cron.adrper79.workers.dev/health');
    expect(manifestUrlFor(scheduleWorker!, 'staging')).toBe('https://schedule-worker.adrper79.workers.dev/manifest');
    expect(manifestUrlFor(videoCron!, 'staging')).toBe('https://video-cron.adrper79.workers.dev/manifest');
  });

  it('returns nulls for local worker discovery', () => {
    const adminStudio = FACTORY_APPS.find((app) => app.id === 'admin-studio');
    expect(adminStudio).toBeTruthy();
    expect(workerNameFor(adminStudio!, 'local')).toBeNull();
    expect(healthUrlFor(adminStudio!, 'local')).toBeNull();
    expect(manifestUrlFor(adminStudio!, 'local')).toBeNull();
  });
});
