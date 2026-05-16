-- Monetization Analytics Queries
-- Query set for VideoKing funnel analysis, retention, churn, and revenue tracking
-- Use with PostHog, Grafana, or BI tool
-- All amounts in cents; divide by 100 for USD display

-- ============================================================================
-- QUERY 1: Subscription Funnel Conversion (Requested → Accepted → Succeeded)
-- ============================================================================
-- Shows step-by-step completion rate for new subscriptions
-- Timeframe: Last 30 days
-- Target: ~40% checkout_started, ~25% payment_processing, ~20% payment_succeeded

SELECT
  DATE(event_timestamp) as event_date,
  COUNT(DISTINCT CASE WHEN event_name = 'subscription_requested' THEN correlation_id END) as requested,
  COUNT(DISTINCT CASE WHEN event_name = 'subscription_checkout_started' THEN correlation_id END) as checkout_started,
  COUNT(DISTINCT CASE WHEN event_name = 'subscription_payment_processing' THEN correlation_id END) as payment_processing,
  COUNT(DISTINCT CASE WHEN event_name = 'subscription_payment_succeeded' THEN correlation_id END) as payment_succeeded,
  
  -- Conversion percentages
  ROUND(
    100.0 * COUNT(DISTINCT CASE WHEN event_name = 'subscription_checkout_started' THEN correlation_id END) /
    NULLIF(COUNT(DISTINCT CASE WHEN event_name = 'subscription_requested' THEN correlation_id END), 0),
    2
  ) as checkout_started_pct,
  ROUND(
    100.0 * COUNT(DISTINCT CASE WHEN event_name = 'subscription_payment_succeeded' THEN correlation_id END) /
    NULLIF(COUNT(DISTINCT CASE WHEN event_name = 'subscription_checkout_started' THEN correlation_id END), 0),
    2
  ) as payment_success_pct
FROM
  factory_events
WHERE
  event_name IN ('subscription_requested', 'subscription_checkout_started', 'subscription_payment_processing', 'subscription_payment_succeeded')
  AND event_timestamp >= NOW() - INTERVAL '30 days'
GROUP BY
  DATE(event_timestamp)
ORDER BY
  event_date DESC;


-- ============================================================================
-- QUERY 2: Unlock Funnel Conversion (Same Pattern as Subscription)
-- ============================================================================

SELECT
  DATE(event_timestamp) as event_date,
  COUNT(DISTINCT CASE WHEN event_name = 'unlock_requested' THEN correlation_id END) as requested,
  COUNT(DISTINCT CASE WHEN event_name = 'unlock_checkout_started' THEN correlation_id END) as checkout_started,
  COUNT(DISTINCT CASE WHEN event_name = 'unlock_payment_succeeded' THEN correlation_id END) as payment_succeeded,
  
  ROUND(
    100.0 * COUNT(DISTINCT CASE WHEN event_name = 'unlock_payment_succeeded' THEN correlation_id END) /
    NULLIF(COUNT(DISTINCT CASE WHEN event_name = 'unlock_requested' THEN correlation_id END), 0),
    2
  ) as success_pct
FROM
  factory_events
WHERE
  event_name IN ('unlock_requested', 'unlock_checkout_started', 'unlock_payment_succeeded')
  AND event_timestamp >= NOW() - INTERVAL '30 days'
GROUP BY
  DATE(event_timestamp)
ORDER BY
  event_date DESC;


-- ============================================================================
-- QUERY 3: Cohort Retention (5-day, 30-day, 90-day)
-- ============================================================================
-- Cohort: Users who first subscribed in a given week
-- Retention: % who renew at day 5, day 30, day 90

WITH subscription_cohorts AS (
  SELECT
    DATE_TRUNC('week', event_timestamp) as cohort_week,
    user_id,
    MIN(event_timestamp) as first_subscription_date
  FROM
    factory_events
  WHERE
    event_name = 'subscription_payment_succeeded'
    AND DATE_TRUNC('week', event_timestamp) >= NOW() - INTERVAL '90 days'
  GROUP BY
    DATE_TRUNC('week', event_timestamp),
    user_id
),
renewal_events AS (
  SELECT
    sc.cohort_week,
    sc.user_id,
    sc.first_subscription_date,
    fe.event_name,
    fe.event_timestamp,
    (fe.event_timestamp - sc.first_subscription_date)::INT as days_since_first
  FROM
    subscription_cohorts sc
  LEFT JOIN
    factory_events fe ON sc.user_id = fe.user_id
    AND fe.event_name IN ('subscription_renewed', 'subscription_payment_succeeded')
    AND fe.event_timestamp > sc.first_subscription_date
)
SELECT
  cohort_week,
  COUNT(DISTINCT user_id) as cohort_size,
  COUNT(DISTINCT CASE WHEN days_since_first BETWEEN 1 AND 5 THEN user_id END) as retained_day_5,
  COUNT(DISTINCT CASE WHEN days_since_first BETWEEN 1 AND 30 THEN user_id END) as retained_day_30,
  COUNT(DISTINCT CASE WHEN days_since_first BETWEEN 1 AND 90 THEN user_id END) as retained_day_90,
  
  ROUND(
    100.0 * COUNT(DISTINCT CASE WHEN days_since_first BETWEEN 1 AND 5 THEN user_id END) /
    NULLIF(COUNT(DISTINCT user_id), 0),
    1
  ) as retention_day_5_pct,
  ROUND(
    100.0 * COUNT(DISTINCT CASE WHEN days_since_first BETWEEN 1 AND 30 THEN user_id END) /
    NULLIF(COUNT(DISTINCT user_id), 0),
    1
  ) as retention_day_30_pct,
  ROUND(
    100.0 * COUNT(DISTINCT CASE WHEN days_since_first BETWEEN 1 AND 90 THEN user_id END) /
    NULLIF(COUNT(DISTINCT user_id), 0),
    1
  ) as retention_day_90_pct
FROM
  renewal_events
GROUP BY
  cohort_week
ORDER BY
  cohort_week DESC;


-- ============================================================================
-- QUERY 4: Churn Reasons Breakdown (Last 30 Days)
-- ============================================================================
-- Top reasons users cancel subscriptions

SELECT
  reason_if_failed,
  COUNT(*) as churn_count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as pct_of_total_churn
FROM
  factory_events
WHERE
  event_name = 'subscription_cancelled'
  AND event_timestamp >= NOW() - INTERVAL '30 days'
GROUP BY
  reason_if_failed
ORDER BY
  churn_count DESC
LIMIT 10;


-- ============================================================================
-- QUERY 5: Creator Earnings Attribution (Per Creator, Per Time Period)
-- ============================================================================
-- Sum of earnings recorded for each creator over last 30 days

SELECT
  DATE_TRUNC('day', event_timestamp) as earn_date,
  creator_id,
  COUNT(*) as earnings_events,
  SUM(amount_cents) as total_earnings_cents,
  SUM(amount_cents) / 100.0 as total_earnings_usd,
  AVG(amount_cents) as avg_earnings_per_event_cents
FROM
  factory_events
WHERE
  event_name = 'creator_earnings_recorded'
  AND event_timestamp >= NOW() - INTERVAL '30 days'
GROUP BY
  DATE_TRUNC('day', event_timestamp),
  creator_id
ORDER BY
  earn_date DESC,
  total_earnings_cents DESC;


-- ============================================================================
-- QUERY 6: Average Revenue Per User (ARPU) Trended Over Time
-- ============================================================================
-- Weekly ARPU: total successful payments / unique subscribers that week

WITH weekly_revenue AS (
  SELECT
    DATE_TRUNC('week', event_timestamp) as week,
    SUM(amount_cents) as weekly_revenue_cents,
    COUNT(DISTINCT user_id) as unique_subscribers
  FROM
    factory_events
  WHERE
    event_name IN ('subscription_payment_succeeded', 'unlock_payment_succeeded')
    AND status = 'success'
    AND event_timestamp >= NOW() - INTERVAL '12 weeks'
  GROUP BY
    DATE_TRUNC('week', event_timestamp)
)
SELECT
  week,
  weekly_revenue_cents / 100.0 as weekly_revenue_usd,
  unique_subscribers,
  ROUND((weekly_revenue_cents / 100.0) / unique_subscribers, 2) as arpu_usd,
  LAG(ROUND((weekly_revenue_cents / 100.0) / unique_subscribers, 2)) OVER (ORDER BY week) as prev_week_arpu,
  ROUND(
    (ROUND((weekly_revenue_cents / 100.0) / unique_subscribers, 2) - 
     LAG(ROUND((weekly_revenue_cents / 100.0) / unique_subscribers, 2)) OVER (ORDER BY week)) /
    LAG(ROUND((weekly_revenue_cents / 100.0) / unique_subscribers, 2)) OVER (ORDER BY week) * 100, 2
  ) as arpu_change_pct
FROM
  weekly_revenue
ORDER BY
  week DESC;


-- ============================================================================
-- QUERY 7: Failed Payment Recovery (Retry & Success Rate)
-- ============================================================================
-- Users who had a failed payment: how many retried? how many succeeded on retry?

WITH failed_users AS (
  SELECT
    user_id,
    correlation_id,
    event_timestamp as failure_time,
    reason_if_failed
  FROM
    factory_events
  WHERE
    event_name = 'subscription_payment_failed'
    AND event_timestamp >= NOW() - INTERVAL '30 days'
),
retry_events AS (
  SELECT
    fu.user_id,
    fu.correlation_id,
    fu.reason_if_failed,
    COUNT(DISTINCT CASE WHEN fe.event_name = 'subscription_payment_succeeded' 
          AND fe.event_timestamp > fu.failure_time THEN fe.correlation_id END) as successful_retries,
    COUNT(DISTINCT CASE WHEN fe.event_name = 'subscription_payment_failed' 
          AND fe.event_timestamp > fu.failure_time THEN fe.correlation_id END) as failed_retries
  FROM
    failed_users fu
  LEFT JOIN
    factory_events fe ON fu.user_id = fe.user_id
    AND (fe.event_name IN ('subscription_payment_succeeded', 'subscription_payment_failed'))
    AND fe.event_timestamp BETWEEN fu.failure_time AND fu.failure_time + INTERVAL '7 days'
  GROUP BY
    fu.user_id,
    fu.correlation_id,
    fu.reason_if_failed
)
SELECT
  COUNT(*) as total_failed_attempts,
  COUNT(DISTINCT CASE WHEN successful_retries > 0 THEN user_id END) as users_who_retried_successfully,
  COUNT(DISTINCT CASE WHEN successful_retries = 0 AND failed_retries > 0 THEN user_id END) as users_who_retried_unsuccessfully,
  COUNT(DISTINCT CASE WHEN successful_retries = 0 AND failed_retries = 0 THEN user_id END) as users_who_never_retried,
  
  ROUND(
    100.0 * COUNT(DISTINCT CASE WHEN successful_retries > 0 THEN user_id END) /
    NULLIF(COUNT(DISTINCT user_id), 0), 1
  ) as recovery_rate_pct,
  
  reason_if_failed
FROM
  retry_events
GROUP BY
  reason_if_failed
ORDER BY
  total_failed_attempts DESC;


-- ============================================================================
-- QUERY 8: Payout Completion Time SLA (Earn → Payout)
-- ============================================================================
-- Average days from earnings_recorded to payout_completed
-- Target SLA: < 7 days

WITH earnings_dates AS (
  SELECT
    creator_id,
    correlation_id,
    event_timestamp as earnings_date
  FROM
    factory_events
  WHERE
    event_name = 'creator_earnings_recorded'
    AND event_timestamp >= NOW() - INTERVAL '90 days'
),
payout_dates AS (
  SELECT
    creator_id,
    correlation_id,
    event_timestamp as payout_date
  FROM
    factory_events
  WHERE
    event_name = 'payout_completed'
    AND event_timestamp >= NOW() - INTERVAL '90 days'
)
SELECT
  ed.creator_id,
  COUNT(*) as total_payouts,
  AVG(EXTRACT(DAY FROM (pd.payout_date - ed.earnings_date)))::NUMERIC(5, 2) as avg_days_to_payout,
  MIN(EXTRACT(DAY FROM (pd.payout_date - ed.earnings_date)))::INT as min_days_to_payout,
  MAX(EXTRACT(DAY FROM (pd.payout_date - ed.earnings_date)))::INT as max_days_to_payout,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(DAY FROM (pd.payout_date - ed.earnings_date)))::INT as median_days_to_payout,
  
  -- SLA compliance: % payouts completed within 7 days
  ROUND(
    100.0 * COUNT(DISTINCT CASE WHEN EXTRACT(DAY FROM (pd.payout_date - ed.earnings_date)) <= 7 THEN pd.correlation_id END) /
    NULLIF(COUNT(*), 0), 1
  ) as sla_compliance_7d_pct,
  
  -- Failed payouts (null payout_date)
  COUNT(DISTINCT CASE WHEN pd.payout_date IS NULL THEN ed.correlation_id END) as failed_payouts
FROM
  earnings_dates ed
LEFT JOIN
  payout_dates pd ON ed.creator_id = pd.creator_id
    AND ed.correlation_id = pd.correlation_id
GROUP BY
  ed.creator_id
ORDER BY
  avg_days_to_payout DESC;


-- ============================================================================
-- BONUS QUERY 9: Payment Failure Analysis by Reason
-- ============================================================================
-- Breakdown of failure reasons and recovery potential

SELECT
  reason_if_failed,
  COUNT(*) as total_failures,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as pct_of_total_failures,
  COUNT(DISTINCT user_id) as affected_users,
  
  -- Recovery patterns (did user try again within 7 days?)
  COUNT(DISTINCT CASE WHEN user_id IN (
    SELECT user_id FROM factory_events f2
    WHERE f2.event_name IN ('subscription_payment_succeeded', 'subscription_payment_failed')
    AND f2.event_timestamp > factory_events.event_timestamp
    AND f2.event_timestamp <= factory_events.event_timestamp + INTERVAL '7 days'
  ) THEN user_id END) as users_who_retried,
  
  ROUND(
    100.0 * COUNT(DISTINCT CASE WHEN user_id IN (
      SELECT user_id FROM factory_events f2
      WHERE f2.event_name IN ('subscription_payment_succeeded', 'subscription_payment_failed')
      AND f2.event_timestamp > factory_events.event_timestamp
      AND f2.event_timestamp <= factory_events.event_timestamp + INTERVAL '7 days'
    ) THEN user_id END) /
    NULLIF(COUNT(DISTINCT user_id), 0), 1
  ) as retry_rate_pct
FROM
  factory_events
WHERE
  event_name = 'subscription_payment_failed'
  AND event_timestamp >= NOW() - INTERVAL '30 days'
GROUP BY
  reason_if_failed
ORDER BY
  total_failures DESC;


-- ============================================================================
-- BONUS QUERY 10: Weekly Revenue Summary (Executive Dashboard)
-- ============================================================================
-- High-level revenue metrics for leadership review

SELECT
  DATE_TRUNC('week', event_timestamp) as week,
  
  -- Total revenue
  ROUND(SUM(CASE WHEN event_name IN ('subscription_payment_succeeded', 'unlock_payment_succeeded') 
                 AND status = 'success' THEN amount_cents ELSE 0 END) / 100.0, 2) as total_revenue_usd,
  
  -- Subscription revenue
  ROUND(SUM(CASE WHEN event_name = 'subscription_payment_succeeded' THEN amount_cents ELSE 0 END) / 100.0, 2) as subscription_revenue_usd,
  
  -- Unlock revenue
  ROUND(SUM(CASE WHEN event_name = 'unlock_payment_succeeded' THEN amount_cents ELSE 0 END) / 100.0, 2) as unlock_revenue_usd,
  
  -- Failed payments (attempted)
  ROUND(SUM(CASE WHEN event_name IN ('subscription_payment_failed', 'unlock_payment_failed')
                 THEN amount_cents ELSE 0 END) / 100.0, 2) as failed_payment_attempt_usd,
  
  -- Creator payouts
  ROUND(SUM(CASE WHEN event_name = 'payout_completed' THEN amount_cents ELSE 0 END) / 100.0, 2) as payout_total_usd,
  
  -- Churn count
  COUNT(DISTINCT CASE WHEN event_name = 'subscription_cancelled' THEN user_id END) as churn_count,
  
  -- Renewal count
  COUNT(DISTINCT CASE WHEN event_name = 'subscription_renewed' THEN user_id END) as renewal_count
  
FROM
  factory_events
WHERE
  event_timestamp >= NOW() - INTERVAL '24 weeks'
GROUP BY
  DATE_TRUNC('week', event_timestamp)
ORDER BY
  week DESC;
