import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import {
  initAnalytics,
  trackFunnelStep,
  getFunnelPosition,
  MONETIZATION_FUNNEL,
  type AnalyticsConfig,
  type FunnelStepId,
} from './index';
import type { FactoryDb } from '@latimer-woods-tech/neon';

type FetchFn = (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type FetchCall = [string, RequestInit];

function getCall(mock: { mock: { calls: unknown[][] } }, index: number): FetchCall {
  const calls = mock.mock.calls as unknown as FetchCall[];
  const call = calls[index];
  if (!call) throw new Error(`no fetch call at index ${String(index)}`);
  return call;
}

function okResponse(): Response {
  return new Response('{}', { status: 200 });
}

function makeDb(): FactoryDb {
  return {
    execute: vi.fn(() => Promise.resolve([]) as unknown as ReturnType<FactoryDb['execute']>),
  } as unknown as FactoryDb;
}

function makeConfig(overrides: Partial<AnalyticsConfig> = {}): AnalyticsConfig {
  return {
    postHogKey: 'phk',
    db: makeDb(),
    appId: 'test-app',
    ...overrides,
  };
}

describe('initAnalytics', () => {
  let fetchMock: Mock<FetchFn>;

  beforeEach(() => {
    fetchMock = vi.fn<FetchFn>(() => Promise.resolve(okResponse()));
  });

  describe('track', () => {
    it('sends regular events to PostHog only', async () => {
      const config = makeConfig();
      const analytics = initAnalytics(config, {
        fetch: fetchMock,
      });
      await analytics.track('button.clicked', { button: 'cta' }, 'user-1');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = getCall(fetchMock, 0);
      expect(url).toBe('https://app.posthog.com/capture/');
      const body = JSON.parse(init.body as string) as {
        api_key: string;
        event: string;
        distinct_id: string;
        properties: Record<string, unknown>;
      };
      expect(body.api_key).toBe('phk');
      expect(body.event).toBe('button.clicked');
      expect(body.distinct_id).toBe('user-1');
      expect(body.properties.button).toBe('cta');
      expect(body.properties.app_id).toBe('test-app');
      // factory_events NOT called for non-business events
      const db = config.db as unknown as { execute: Mock<FactoryDb['execute']> };
      expect(db.execute).not.toHaveBeenCalled();
    });

    it('uses anonymous distinct_id when userId omitted', async () => {
      const analytics = initAnalytics(makeConfig(), { fetch: fetchMock });
      await analytics.track('page.viewed');
      const [, init] = getCall(fetchMock, 0);
      const body = JSON.parse(init.body as string) as { distinct_id: string };
      expect(body.distinct_id).toBe('anonymous');
    });

    it('sends business events to PostHog AND factory_events', async () => {
      const config = makeConfig();
      const analytics = initAnalytics(config, {
        fetch: fetchMock,
      });
      await analytics.track('revenue.mrr_updated', { mrr: 4900 }, 'user-2');

      // PostHog call
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, init] = getCall(fetchMock, 0);
      const body = JSON.parse(init.body as string) as { event: string };
      expect(body.event).toBe('revenue.mrr_updated');

      // factory_events call
      const db = config.db as unknown as { execute: Mock<FactoryDb['execute']> };
      expect(db.execute).toHaveBeenCalledTimes(1);
    });

    it('routes subscription. events to both destinations', async () => {
      const config = makeConfig();
      const analytics = initAnalytics(config, { fetch: fetchMock });
      await analytics.track('subscription.created', { plan: 'pro' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const db = config.db as unknown as { execute: Mock<FactoryDb['execute']> };
      expect(db.execute).toHaveBeenCalledTimes(1);
    });

    it('routes compliance. events to both destinations', async () => {
      const config = makeConfig();
      const analytics = initAnalytics(config, { fetch: fetchMock });
      await analytics.track('compliance.gdpr_request', { userId: 'u' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const db = config.db as unknown as { execute: Mock<FactoryDb['execute']> };
      expect(db.execute).toHaveBeenCalledTimes(1);
    });

    it('throws InternalError when PostHog returns non-2xx', async () => {
      fetchMock = vi.fn<FetchFn>(() => Promise.resolve(new Response('bad', { status: 500 })));
      const analytics = initAnalytics(makeConfig(), { fetch: fetchMock });
      await expect(analytics.track('button.clicked')).rejects.toMatchObject({
        code: 'INTERNAL_ERROR',
      });
    });

    it('throws InternalError when factory_events insert fails', async () => {
      const db = makeDb();
      (db as unknown as { execute: Mock<FactoryDb['execute']> }).execute =
        vi.fn<FactoryDb['execute']>(() => Promise.reject(new Error('db err')));
      const analytics = initAnalytics(
        { postHogKey: 'k', db, appId: 'app' },
        { fetch: fetchMock },
      );
      await expect(analytics.track('revenue.fail', {})).rejects.toMatchObject({
        code: 'INTERNAL_ERROR',
      });
    });
  });

  describe('identify', () => {
    it('sends $identify to PostHog with traits', async () => {
      const analytics = initAnalytics(makeConfig(), { fetch: fetchMock });
      await analytics.identify('user-3', { email: 'user@example.com', plan: 'pro' });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, init] = getCall(fetchMock, 0);
      const body = JSON.parse(init.body as string) as {
        event: string;
        distinct_id: string;
        properties: Record<string, unknown>;
      };
      expect(body.event).toBe('$identify');
      expect(body.distinct_id).toBe('user-3');
      expect(body.properties.email).toBe('user@example.com');
    });
  });

  describe('businessEvent', () => {
    it('inserts directly into factory_events without calling PostHog', async () => {
      const config = makeConfig();
      const analytics = initAnalytics(config, { fetch: fetchMock });
      await analytics.businessEvent('revenue.invoice_paid', { amount: 9900 }, 'user-4');

      expect(fetchMock).not.toHaveBeenCalled();
      const db = config.db as unknown as { execute: Mock<FactoryDb['execute']> };
      expect(db.execute).toHaveBeenCalledTimes(1);
    });

    it('inserts with null userId when omitted', async () => {
      const config = makeConfig();
      const analytics = initAnalytics(config, { fetch: fetchMock });
      await analytics.businessEvent('compliance.deletion_request', { reason: 'gdpr' });

      expect(fetchMock).not.toHaveBeenCalled();
      const db = config.db as unknown as { execute: Mock<FactoryDb['execute']> };
      expect(db.execute).toHaveBeenCalledTimes(1);
    });
  });

  describe('page', () => {
    it('sends $pageview to PostHog with page name as $current_url', async () => {
      const analytics = initAnalytics(makeConfig(), { fetch: fetchMock });
      await analytics.page('/dashboard', { source: 'email' });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, init] = getCall(fetchMock, 0);
      const body = JSON.parse(init.body as string) as {
        event: string;
        properties: Record<string, unknown>;
      };
      expect(body.event).toBe('$pageview');
      expect(body.properties.$current_url).toBe('/dashboard');
      expect(body.properties.source).toBe('email');
      expect(body.properties.app_id).toBe('test-app');
    });
  });
});

describe('MONETIZATION_FUNNEL', () => {
  it('has 5 steps in signup → day-30-retention order', () => {
    expect(MONETIZATION_FUNNEL).toHaveLength(5);
    const ids = MONETIZATION_FUNNEL.map((s) => s.id);
    expect(ids).toEqual(['signup', 'first-action', 'paid', 'renewal', 'day-30-retention']);
  });

  it('every step has a funnel.* event name', () => {
    for (const step of MONETIZATION_FUNNEL) {
      expect(step.event).toMatch(/^funnel\./);
      expect(step.description.length).toBeGreaterThan(0);
    }
  });
});

describe('trackFunnelStep', () => {
  let fetchMock: Mock<FetchFn>;
  let analytics: ReturnType<typeof initAnalytics>;

  beforeEach(() => {
    fetchMock = vi.fn<FetchFn>(() => Promise.resolve(new Response('{}', { status: 200 })));
    analytics = initAnalytics(makeConfig(), { fetch: fetchMock });
  });

  it('tracks paid step with funnel metadata enrichment', async () => {
    await trackFunnelStep(analytics, 'paid', 'user-42', { product: 'humandesign' }, { plan: 'practitioner' });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = getCall(fetchMock, 0);
    const body = JSON.parse(init.body as string) as { event: string; properties: Record<string, unknown> };
    expect(body.event).toBe('funnel.paid');
    expect(body.properties.funnel_step).toBe('paid');
    expect(body.properties.funnel_product).toBe('humandesign');
    expect(body.properties.funnel_order).toBe(2);
    expect(body.properties.plan).toBe('practitioner');
  });

  it('uses event override when configured', async () => {
    await trackFunnelStep(
      analytics,
      'signup',
      'user-43',
      { product: 'capricast', eventOverrides: { signup: 'creator.registered' } },
    );
    const [, init] = getCall(fetchMock, 0);
    const body = JSON.parse(init.body as string) as { event: string };
    expect(body.event).toBe('creator.registered');
  });

  it('tracks all 5 funnel steps without error', async () => {
    const steps: FunnelStepId[] = ['signup', 'first-action', 'paid', 'renewal', 'day-30-retention'];
    for (const step of steps) {
      await trackFunnelStep(analytics, step, 'user-44', { product: 'test' });
    }
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('is a no-op for unknown step id (type-safe guard)', async () => {
    // Cast to bypass type check — simulates a runtime string that slips through
    await trackFunnelStep(analytics, 'unknown' as FunnelStepId, 'user-45', { product: 'test' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('getFunnelPosition', () => {
  function makeQueryDb(events: string[]): FactoryDb {
    return {
      execute: vi.fn(() =>
        Promise.resolve({
          rows: events.map((event) => ({ event })),
        }) as unknown as ReturnType<FactoryDb['execute']>,
      ),
    } as unknown as FactoryDb;
  }

  it('returns null currentStep when user has no funnel events', async () => {
    const db = makeQueryDb([]);
    const pos = await getFunnelPosition(db, 'user-1', 'humandesign');
    expect(pos.currentStep).toBeNull();
    expect(pos.completedSteps).toEqual([]);
  });

  it('returns current step as the most advanced completed step', async () => {
    const db = makeQueryDb(['funnel.signup', 'funnel.first_action', 'funnel.paid']);
    const pos = await getFunnelPosition(db, 'user-2', 'humandesign');
    expect(pos.currentStep).toBe('paid');
    expect(pos.completedSteps).toEqual(['signup', 'first-action', 'paid']);
  });

  it('returns only signup when only signup is completed', async () => {
    const db = makeQueryDb(['funnel.signup']);
    const pos = await getFunnelPosition(db, 'user-3', 'humandesign');
    expect(pos.currentStep).toBe('signup');
    expect(pos.completedSteps).toEqual(['signup']);
  });

  it('respects eventOverrides in config', async () => {
    const db = makeQueryDb(['creator.registered']);
    const pos = await getFunnelPosition(db, 'user-4', 'capricast', {
      product: 'capricast',
      eventOverrides: { signup: 'creator.registered' },
    });
    expect(pos.currentStep).toBe('signup');
    expect(pos.completedSteps).toEqual(['signup']);
  });

  it('handles full funnel completion', async () => {
    const events = MONETIZATION_FUNNEL.map((s) => s.event);
    const db = makeQueryDb(events);
    const pos = await getFunnelPosition(db, 'user-5', 'humandesign');
    expect(pos.currentStep).toBe('day-30-retention');
    expect(pos.completedSteps).toHaveLength(5);
  });
});
