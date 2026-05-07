/**
 * Stripe MRR section — monthly recurring revenue snapshot + 24h delta.
 * Uses the Stripe REST API directly (no Node SDK — Worker-safe).
 * Requires STRIPE_SECRET_KEY secret.
 */

export interface StripeMrrData {
  mrrCents: number;
  mrrFormatted: string;
  deltaVsYesterdayCents: number;
  deltaFormatted: string;
  deltaDirection: 'up' | 'down' | 'flat';
  activeSubscriptions: number;
  newSubscriptionsToday: number;
  cancelledToday: number;
  trialCount: number;
}

interface StripeSubscription {
  id: string;
  status: string;
  trial_end: number | null;
  created: number;
  canceled_at: number | null;
  items: {
    data: Array<{
      price: {
        unit_amount: number | null;
        recurring: { interval: 'month' | 'year' | 'week' | 'day' } | null;
      };
      quantity: number;
    }>;
  };
}

interface StripeListResponse {
  data: StripeSubscription[];
  has_more: boolean;
}

function stripeHeaders(secretKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${secretKey}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
}

/** Normalise any billing interval to a month-equivalent price in cents */
function toMonthlyCents(sub: StripeSubscription): number {
  return sub.items.data.reduce((acc, item) => {
    const amount = item.price.unit_amount ?? 0;
    const qty = item.quantity ?? 1;
    const interval = item.price.recurring?.interval ?? 'month';
    const monthly =
      interval === 'year' ? (amount * qty) / 12
      : interval === 'week' ? amount * qty * 4
      : interval === 'day' ? amount * qty * 30
      : amount * qty; // month
    return acc + monthly;
  }, 0);
}

async function fetchAllActive(secretKey: string): Promise<StripeSubscription[]> {
  const all: StripeSubscription[] = [];
  let startingAfter: string | null = null;

  for (let page = 0; page < 10; page++) {
    const params = new URLSearchParams({
      status: 'active',
      limit: '100',
      'expand[]': 'data.items',
    });
    if (startingAfter) params.set('starting_after', startingAfter);

    const res = await fetch(`https://api.stripe.com/v1/subscriptions?${params.toString()}`, {
      headers: stripeHeaders(secretKey),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) break;
    const body = (await res.json()) as StripeListResponse;
    all.push(...body.data);
    if (!body.has_more) break;
    startingAfter = body.data[body.data.length - 1]?.id ?? null;
  }
  return all;
}

function formatDollars(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.abs(cents) / 100);
}

async function fetchTrialingSubs(secretKey: string): Promise<StripeSubscription[]> {
  const res = await fetch(
    `https://api.stripe.com/v1/subscriptions?status=trialing&limit=100&expand[]=data.items`,
    { headers: stripeHeaders(secretKey), signal: AbortSignal.timeout(10_000) },
  );
  if (!res.ok) return [];
  const body = (await res.json()) as StripeListResponse;
  return body.data;
}

export async function fetchStripeMrr(secretKey: string): Promise<StripeMrrData> {
  const now = Math.floor(Date.now() / 1000);
  const oneDayAgo = now - 86_400;

  const [allActive, trialSubs] = await Promise.all([
    fetchAllActive(secretKey),
    fetchTrialingSubs(secretKey),
  ]);

  const currentMrrCents = allActive.reduce((acc, s) => acc + toMonthlyCents(s), 0);

  // Estimate yesterday's MRR by removing subs created today and adding back cancelled-today
  const newToday = allActive.filter((s) => s.created >= oneDayAgo);
  const cancelledToday = allActive.filter(
    (s) => s.canceled_at !== null && s.canceled_at >= oneDayAgo,
  );

  const mrrFromNewToday = newToday.reduce((acc, s) => acc + toMonthlyCents(s), 0);
  const mrrFromCancelledToday = cancelledToday.reduce((acc, s) => acc + toMonthlyCents(s), 0);
  const yesterdayMrrCents = currentMrrCents - mrrFromNewToday + mrrFromCancelledToday;
  const deltaCents = currentMrrCents - yesterdayMrrCents;

  return {
    mrrCents: currentMrrCents,
    mrrFormatted: formatDollars(currentMrrCents),
    deltaVsYesterdayCents: deltaCents,
    deltaFormatted: `${deltaCents >= 0 ? '+' : '-'}${formatDollars(deltaCents)}`,
    deltaDirection: deltaCents > 50 ? 'up' : deltaCents < -50 ? 'down' : 'flat',
    activeSubscriptions: allActive.length,
    newSubscriptionsToday: newToday.length,
    cancelledToday: cancelledToday.length,
    trialCount: trialSubs.length,
  };
}
