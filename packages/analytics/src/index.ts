import { InternalError } from '@latimer-woods-tech/errors';
import { sql } from '@latimer-woods-tech/neon';
import type { FactoryDb } from '@latimer-woods-tech/neon';

// Event schema contract (W360-021) — re-exported for consumer tests
export {
  validateEventShape,
  assertEventShape,
  getCriticalEventNames,
  CRITICAL_EVENT_SCHEMAS,
} from './event-schemas.js';
export type { EventSchema, EventValidationResult } from './event-schemas.js';

/**
 * Routing destination for an analytics event.
 */
export type EventDestination = 'posthog' | 'factory_events' | 'both';

/**
 * Configuration provided to {@link initAnalytics}.
 */
export interface AnalyticsConfig {
  postHogKey: string;
  db: FactoryDb;
  appId: string;
}

/**
 * Analytics interface returned by {@link initAnalytics}.
 */
export interface Analytics {
  /**
   * Routes to PostHog + `factory_events` based on event type.
   */
  track(
    event: string,
    properties?: Record<string, unknown>,
    userId?: string,
  ): Promise<void>;
  /**
   * Identifies a user — PostHog only.
   */
  identify(userId: string, traits: Record<string, unknown>): Promise<void>;
  /**
   * Records a revenue or compliance event to `factory_events` only.
   */
  businessEvent(
    event: string,
    properties: Record<string, unknown>,
    userId?: string,
  ): Promise<void>;
  /**
   * Tracks a page view — PostHog only.
   */
  page(name: string, properties?: Record<string, unknown>): Promise<void>;
}

/** @internal Looser fetch signature compatible with vi.fn mocks. */
type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/**
 * @internal Injected dependencies — primarily for testing.
 */
export interface AnalyticsDeps {
  fetch?: FetchFn;
}

const POSTHOG_URL = 'https://app.posthog.com/capture/';

/**
 * Business events that are always stored in `factory_events` (and never sent
 * to PostHog to avoid leaking revenue data to a third-party SaaS).
 */
const BUSINESS_EVENT_PREFIXES = ['revenue.', 'subscription.', 'compliance.', 'billing.'] as const;

function isBusinessEvent(event: string): boolean {
  return BUSINESS_EVENT_PREFIXES.some((prefix) => event.startsWith(prefix));
}

async function sendToPostHog(
  key: string,
  event: string,
  distinctId: string,
  properties: Record<string, unknown>,
  fetchImpl: FetchFn,
): Promise<void> {
  const res = await fetchImpl(POSTHOG_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: key,
      event,
      distinct_id: distinctId,
      properties,
      timestamp: new Date().toISOString(),
    }),
  });
  if (!res.ok) {
    throw new InternalError(`PostHog capture failed with status ${String(res.status)}`, {
      status: res.status,
    });
  }
}

async function insertFactoryEvent(
  db: FactoryDb,
  appId: string,
  event: string,
  properties: Record<string, unknown>,
  userId: string | undefined,
): Promise<void> {
  const props = JSON.stringify(properties);
  const uid = userId ?? null;
  try {
    await db.execute(
      sql`INSERT INTO factory_events (app_id, event, properties, user_id, occurred_at)
          VALUES (${appId}, ${event}, ${props}::jsonb, ${uid}, NOW())`,
    );
  } catch (err) {
    throw new InternalError(`factory_events insert failed: ${(err as Error).message}`, {
      event,
    });
  }
}

/**
 * Initialises analytics with the provided config and returns an {@link Analytics} instance.
 *
 * @example
 * ```ts
 * const analytics = initAnalytics({ postHogKey: env.POSTHOG_KEY, db, appId: 'ijustus' });
 * await analytics.track('button.clicked', { button: 'cta' }, userId);
 * ```
 */
export function initAnalytics(config: AnalyticsConfig, deps: AnalyticsDeps = {}): Analytics {
  const fetchImpl: FetchFn = deps.fetch ?? fetch;

  return {
    async track(event, properties = {}, userId): Promise<void> {
      // Business events go to both PostHog and factory_events;
      // regular events go to PostHog only.
      const dest: EventDestination = isBusinessEvent(event) ? 'both' : 'posthog';
      const distinctId = userId ?? 'anonymous';
      const enriched = { ...properties, app_id: config.appId };

      if (dest === 'both' || dest === 'posthog') {
        await sendToPostHog(config.postHogKey, event, distinctId, enriched, fetchImpl);
      }
      if (dest === 'both') {
        await insertFactoryEvent(config.db, config.appId, event, enriched, userId);
      }
    },

    async identify(userId, traits): Promise<void> {
      const props = { ...traits, app_id: config.appId };
      await sendToPostHog(config.postHogKey, '$identify', userId, props, fetchImpl);
    },

    async businessEvent(event, properties, userId): Promise<void> {
      const enriched = { ...properties, app_id: config.appId };
      await insertFactoryEvent(config.db, config.appId, event, enriched, userId);
    },

    async page(name, properties = {}): Promise<void> {
      const enriched = { ...properties, app_id: config.appId, $current_url: name };
      await sendToPostHog(config.postHogKey, '$pageview', 'anonymous', enriched, fetchImpl);
    },
  };
}

// ── Monetization funnel (G34) ─────────────────────────────────────────────────

/**
 * Identifiers for the five standard monetization funnel steps.
 */
export type FunnelStepId =
  | 'signup'
  | 'first-action'
  | 'paid'
  | 'renewal'
  | 'day-30-retention';

/**
 * A single step in the monetization funnel.
 */
export interface FunnelStep {
  /** Canonical step identifier. */
  id: FunnelStepId;
  /** PostHog event name tracked when this step is reached. */
  event: string;
  /** Human-readable description for dashboards. */
  description: string;
}

/**
 * The standard five-step monetization funnel.
 *
 * PostHog funnel definition:
 *   signup → first-action → paid → renewal → day-30-retention
 *
 * Steps use `funnel.*` event prefix so PostHog dashboards can filter them
 * as a group and they're visually distinct from product events.
 */
export const MONETIZATION_FUNNEL: readonly FunnelStep[] = [
  {
    id: 'signup',
    event: 'funnel.signup',
    description: 'User created an account',
  },
  {
    id: 'first-action',
    event: 'funnel.first_action',
    description: 'First meaningful in-app action completed',
  },
  {
    id: 'paid',
    event: 'funnel.paid',
    description: 'Became a paying customer (first successful charge)',
  },
  {
    id: 'renewal',
    event: 'funnel.renewal',
    description: 'Renewed subscription (second+ successful charge)',
  },
  {
    id: 'day-30-retention',
    event: 'funnel.day30_retained',
    description: 'Still active 30 days after first paid event',
  },
] as const;

/**
 * Per-product funnel configuration.
 */
export interface FunnelConfig {
  /** App/product identifier (e.g. "humandesign", "capricast"). */
  product: string;
  /**
   * Override which canonical event name to emit for each funnel step.
   * Defaults to the step's own `event` when omitted.
   */
  eventOverrides?: Partial<Record<FunnelStepId, string>>;
}

/**
 * Track a monetization funnel step event via the given Analytics instance.
 *
 * Enriches the event with `funnel_step`, `funnel_product`, and `funnel_order`
 * so PostHog funnels can group by step. The event is sent to PostHog only
 * (not factory_events) to avoid double-counting.
 *
 * @example
 * ```ts
 * await trackFunnelStep(analytics, 'paid', userId, { product: 'humandesign' });
 * ```
 */
export async function trackFunnelStep(
  analytics: Analytics,
  stepId: FunnelStepId,
  userId: string,
  config: FunnelConfig,
  properties: Record<string, unknown> = {},
): Promise<void> {
  const step = MONETIZATION_FUNNEL.find((s) => s.id === stepId);
  if (!step) return;
  const event = config.eventOverrides?.[stepId] ?? step.event;
  await analytics.track(
    event,
    {
      ...properties,
      funnel_step: stepId,
      funnel_product: config.product,
      funnel_order: MONETIZATION_FUNNEL.indexOf(step),
      funnel_description: step.description,
    },
    userId,
  );
}

/**
 * Result of {@link getFunnelPosition}.
 */
export interface FunnelPosition {
  /** The most advanced funnel step the user has reached, or `null` if none. */
  currentStep: FunnelStepId | null;
  /** All steps completed by this user (may span multiple sessions). */
  completedSteps: FunnelStepId[];
}

/**
 * Query `factory_events` to determine where a user stands in the monetization
 * funnel. Returns completed steps in funnel order.
 *
 * Note: only works for funnel steps that were tracked via {@link trackFunnelStep}
 * (i.e. the event name matches `funnel.*`). Relies on `factory_events` — not
 * PostHog — so it works in backend contexts without a PostHog read API key.
 */
export async function getFunnelPosition(
  db: FactoryDb,
  userId: string,
  appId: string,
  config: FunnelConfig = { product: appId },
): Promise<FunnelPosition> {
  const eventNames = MONETIZATION_FUNNEL.map(
    (s) => config.eventOverrides?.[s.id] ?? s.event,
  );

  const result = await db.execute<{ event: string }>(
    sql`SELECT DISTINCT event
        FROM factory_events
        WHERE app_id = ${appId}
          AND user_id = ${userId}
          AND event = ANY(${eventNames}::text[])`,
  );

  const seenEvents = new Set(result.rows.map((r) => r.event));

  const completedSteps = MONETIZATION_FUNNEL
    .filter((s) => seenEvents.has(config.eventOverrides?.[s.id] ?? s.event))
    .map((s) => s.id);

  const currentStep = completedSteps.length > 0
    ? completedSteps[completedSteps.length - 1] ?? null
    : null;

  return { currentStep, completedSteps };
}
