#!/usr/bin/env node

/**
 * VideoKing SLO Metrics Collection Script
 * 
 * Purpose: Collect weekly SLO metrics from Sentry, Cloudflare, and database
 * Runs: Every Monday 9am UTC via GitHub Actions
 * Outputs: PostHog events + Slack notifications + dashboard update
 * 
 * Usage: node scripts/videoking-slo-collect.js --week 2026-04-28
 */

import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';

const SENTRY_DSN = process.env.SENTRY_DSN;
const SENTRY_ORG = process.env.SENTRY_ORG || 'factory';
const SENTRY_PROJECT = process.env.SENTRY_PROJECT || 'videoking';
const POSTHOG_KEY = process.env.POSTHOG_KEY;
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_OPS;
const CLOUDFLARE_TOKEN = process.env.CF_API_TOKEN;
const CLOUDFLARE_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;

/**
 * Calculate date range: Monday of last week to today
 */
function getDateRange(baseDate = new Date()) {
  const today = new Date(baseDate);
  const dayOfWeek = today.getDay();
  
  // If today is Monday or later, use last week
  const daysBack = dayOfWeek === 1 ? 7 : dayOfWeek + 6;
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - daysBack);
  startDate.setHours(0, 0, 0, 0);
  
  const endDate = new Date(today);
  endDate.setHours(23, 59, 59, 999);
  
  return { startDate, endDate };
}

/**
 * Fetch metrics from Sentry
 */
async function fetchSentryMetrics(startDate, endDate) {
  const startISO = startDate.toISOString();
  const endISO = endDate.toISOString();
  
  // Query: count(successful requests) / count(all requests)
  const queries = [
    {
      name: 'availability',
      query: `event.type:transaction status:[200,201,202,204,301,302,304,307,308,400,401,403,404] timestamp:[${startISO} TO ${endISO}]`,
    },
    {
      name: 'error_rate',
      query: `event.type:transaction status:[500,502,503] timestamp:[${startISO} TO ${endISO}]`,
    },
    {
      name: 'total_requests',
      query: `event.type:transaction timestamp:[${startISO} TO ${endISO}]`,
    },
  ];
  
  const results = {};
  
  for (const { name, query } of queries) {
    const url = `https://sentry.io/api/0/organizations/${SENTRY_ORG}/issues/?query=${encodeURIComponent(query)}`;
    
    try {
      const response = await httpGet(url, {
        'Authorization': `Bearer ${process.env.SENTRY_AUTH_TOKEN}`,
      });
      const data = JSON.parse(response);
      results[name] = data.length || 0;
    } catch (error) {
      console.error(`Failed to fetch ${name}:`, error.message);
      results[name] = 0;
    }
  }
  
  return results;
}

/**
 * Fetch metrics from Cloudflare Analytics
 */
async function fetchCloudflareMetrics(startDate, endDate) {
  const startISO = Math.floor(startDate.getTime() / 1000);
  const endISO = Math.floor(endDate.getTime() / 1000);
  
  // GraphQL query to Cloudflare Analytics Engine
  const query = `
    query GetAnalytics($fromTimestamp: Int!, $toTimestamp: Int!) {
      viewer {
        zones(filter: {accountTag: "${CLOUDFLARE_ACCOUNT_ID}"}) {
          httpRequests1mGroups(filter: {datetime_geq: $fromTimestamp, datetime_leq: $toTimestamp}) {
            sum {
              requests
              cachedRequests
              threatRequests
            }
            avg {
              clientSSLProtocol
              clientRequestBytes
              clientResponseBytes
              originResponseTime
            }
          }
        }
      }
    }
  `;
  
  try {
    const response = await httpPost('https://api.cloudflare.com/client/v4/graphql', {
      'Authorization': `Bearer ${CLOUDFLARE_TOKEN}`,
      'Content-Type': 'application/json',
    }, JSON.stringify({ query, variables: { fromTimestamp: startISO, toTimestamp: endISO } }));
    
    const data = JSON.parse(response);
    if (data.errors) {
      throw new Error(`GraphQL error: ${JSON.stringify(data.errors)}`);
    }
    
    const stats = data.data.viewer.zones[0].httpRequests1mGroups[0];
    return {
      total_requests: stats.sum.requests,
      cached_requests: stats.sum.cachedRequests,
      threat_requests: stats.sum.threatRequests,
      avg_response_time: stats.avg.originResponseTime,
    };
  } catch (error) {
    console.error('Failed to fetch Cloudflare metrics:', error.message);
    return {};
  }
}

/**
 * Calculate availability and error rate
 */
function calculateMetrics(sentryData, cloudflareData) {
  const totalRequests = sentryData.total_requests || 1; // avoid division by zero
  const errorRequests = sentryData.error_rate || 0;
  const successfulRequests = sentryData.availability || 0;
  
  const errorRate = ((errorRequests / totalRequests) * 100).toFixed(2);
  const availability = ((successfulRequests / totalRequests) * 100).toFixed(2);
  
  return {
    availability_percent: parseFloat(availability),
    error_rate_percent: parseFloat(errorRate),
    total_requests: totalRequests,
    avg_response_time_ms: cloudflareData.avg_response_time || 0,
  };
}

/**
 * Post metrics to PostHog
 */
async function postToPostHog(metrics, startDate, endDate) {
  const payload = {
    event: 'videoking_slo_weekly',
    properties: {
      ...metrics,
      week_start: startDate.toISOString(),
      week_end: endDate.toISOString(),
      timestamp: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
  };
  
  try {
    await httpPost(
      'https://us.posthog.com/capture/',
      { 'Content-Type': 'application/json' },
      JSON.stringify({
        api_key: POSTHOG_KEY,
        event: payload.event,
        properties: payload.properties,
        timestamp: payload.timestamp,
      })
    );
    console.log('✓ Posted metrics to PostHog');
  } catch (error) {
    console.error('Failed to post to PostHog:', error.message);
  }
}

/**
 * Post summary to Slack
 */
async function postToSlack(metrics, startDate, endDate) {
  const targetAvailability = 99.9;
  const targetErrorRate = 0.1;
  
  const availabilityStatus = metrics.availability_percent >= targetAvailability ? '✅' : '⚠️';
  const errorRateStatus = metrics.error_rate_percent <= targetErrorRate ? '✅' : '⚠️';
  
  const message = {
    channel: '#ops',
    username: 'VideoKing SLO Bot',
    icon_emoji: ':chart_with_upwards_trend:',
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '📊 VideoKing Weekly SLO Report',
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Week:* ${startDate.toLocaleDateString()} – ${endDate.toLocaleDateString()}`,
          },
          {
            type: 'mrkdwn',
            text: '*Collected:* Every Monday 9am UTC',
          },
        ],
      },
      {
        type: 'divider',
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `${availabilityStatus} *Availability*\n${metrics.availability_percent.toFixed(2)}% (target: ${targetAvailability}%)`,
          },
          {
            type: 'mrkdwn',
            text: `${errorRateStatus} *Error Rate*\n${metrics.error_rate_percent.toFixed(2)}% (target: ${targetErrorRate}%)`,
          },
          {
            type: 'mrkdwn',
            text: `*Total Requests*\n${metrics.total_requests.toLocaleString()}`,
          },
          {
            type: 'mrkdwn',
            text: `*Avg Response Time*\n${metrics.avg_response_time_ms.toFixed(0)}ms`,
          },
        ],
      },
      {
        type: 'divider',
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Interpretation:*\n• If availability < 99.9%, we consumed error budget\n• If error rate > 0.1%, investigate recent deployments\n• Next standup: Monday 10am UTC',
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'View Dashboard',
            },
            url: 'https://app.posthog.com/dashboards',
            action_id: 'view_dashboard',
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'View Sentry Errors',
            },
            url: `https://sentry.io/organizations/${SENTRY_ORG}/issues/?project=${SENTRY_PROJECT}`,
            action_id: 'view_sentry',
          },
        ],
      },
    ],
  };
  
  try {
    await httpPost(SLACK_WEBHOOK, { 'Content-Type': 'application/json' }, JSON.stringify(message));
    console.log('✓ Posted summary to Slack #ops');
  } catch (error) {
    console.error('Failed to post to Slack:', error.message);
  }
}

/**
 * Helper: HTTP GET
 */
function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.end();
  });
}

/**
 * Helper: HTTP POST
 */
function httpPost(url, headers = {}, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const req = https.request(
      {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve(data));
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Main
 */
async function main() {
  console.log('🚀 VideoKing SLO Metrics Collection Starting...');
  
  const { startDate, endDate } = getDateRange();
  console.log(`📅 Week: ${startDate.toLocaleDateString()} – ${endDate.toLocaleDateString()}`);
  
  // Fetch data
  console.log('📊 Fetching metrics from Sentry...');
  const sentryData = await fetchSentryMetrics(startDate, endDate);
  
  console.log('📡 Fetching metrics from Cloudflare...');
  const cloudflareData = await fetchCloudflareMetrics(startDate, endDate);
  
  // Calculate
  console.log('🧮 Calculating SLO metrics...');
  const metrics = calculateMetrics(sentryData, cloudflareData);
  console.log(`   Availability: ${metrics.availability_percent.toFixed(2)}%`);
  console.log(`   Error Rate: ${metrics.error_rate_percent.toFixed(2)}%`);
  console.log(`   Total Requests: ${metrics.total_requests}`);
  
  // Post
  if (POSTHOG_KEY) {
    await postToPostHog(metrics, startDate, endDate);
  } else {
    console.warn('⚠️  POSTHOG_KEY not set; skipping PostHog');
  }
  
  if (SLACK_WEBHOOK) {
    await postToSlack(metrics, startDate, endDate);
  } else {
    console.warn('⚠️  SLACK_WEBHOOK_OPS not set; skipping Slack');
  }
  
  // Save to file for CI/CD artifact.
  // Sanitize metrics to ensure only numeric values are persisted (breaks HTTP taint chain).
  const reportPath = path.join(process.cwd(), 'slo-report-latest.json');
  const safeMetrics = {
    availability_percent: Number(metrics.availability_percent),
    error_rate_percent: Number(metrics.error_rate_percent),
    total_requests: Number(metrics.total_requests),
    avg_response_time_ms: Number(metrics.avg_response_time_ms),
  };
  fs.writeFileSync(reportPath, JSON.stringify({
    week_start: startDate.toISOString(),
    week_end: endDate.toISOString(),
    collected_at: new Date().toISOString(),
    metrics: safeMetrics,
  }, null, 2));
  console.log(`✓ Saved report to ${reportPath}`);
  
  console.log('✅ SLO Collection Complete');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
