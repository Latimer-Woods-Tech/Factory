#!/usr/bin/env node

/**
 * Weekly delivery KPI reporter for the Factory repository.
 *
 * Uses GitHub REST API and an incident tracker API to calculate:
 * - Lead time for changes
 * - Deployment frequency
 * - Change failure rate
 * - MTTR
 *
 * Posts results to Slack and archives a CSV snapshot. This file is intentionally
 * dependency-free so it can run in GitHub Actions without extra package installs.
 */

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const INCIDENT_TRACKER_API = process.env.INCIDENT_TRACKER_API;
const INCIDENT_TRACKER_TOKEN = process.env.INCIDENT_TRACKER_TOKEN;
const ORG = process.env.KPI_REPO_OWNER || 'adrper79-dot';
const REPO = process.env.KPI_REPO_NAME || 'factory';
const DAYS_FOR_LEAD_TIME = 30;
const DAYS_FOR_DEPLOY_FREQ = 7;

if (!GITHUB_TOKEN || !SLACK_WEBHOOK_URL) {
  console.error('Missing required environment variables: GITHUB_TOKEN, SLACK_WEBHOOK_URL');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${GITHUB_TOKEN}`,
  Accept: 'application/vnd.github+json',
};

async function fetchJson(url, options = {}) {
  const response = await fetch(url, { headers, ...options });
  if (!response.ok) {
    throw new Error(`GitHub API error ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

async function fetchIncidentJson(url) {
  if (!INCIDENT_TRACKER_API || !INCIDENT_TRACKER_TOKEN) {
    return [];
  }
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${INCIDENT_TRACKER_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`Incident tracker error ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

function daysBetween(start, end) {
  return Math.max(0, Math.round((new Date(end) - new Date(start)) / (1000 * 60 * 60 * 24)));
}

async function getMergedPrs() {
  const url = `https://api.github.com/repos/${ORG}/${REPO}/pulls?state=closed&sort=updated&direction=desc&per_page=100`;
  const prs = await fetchJson(url);
  return prs.filter(pr => pr.merged_at).map(pr => ({ number: pr.number, mergedAt: pr.merged_at }));
}

async function getFirstCommitDate(prNumber) {
  const url = `https://api.github.com/repos/${ORG}/${REPO}/pulls/${prNumber}/commits?per_page=100`;
  const commits = await fetchJson(url);
  if (!commits.length) {
    return null;
  }
  const dates = commits.map(c => new Date(c.commit.committer.date).getTime());
  return new Date(Math.min(...dates)).toISOString();
}

async function getLeadTime() {
  const prs = await getMergedPrs();
  const recent = prs.filter(pr => {
    const mergedAt = new Date(pr.mergedAt);
    return mergedAt >= new Date(Date.now() - DAYS_FOR_LEAD_TIME * 24 * 60 * 60 * 1000);
  }).slice(0, 25);
  
  const values = [];
  for (const pr of recent) {
    const firstCommit = await getFirstCommitDate(pr.number);
    if (!firstCommit) {
      continue;
    }
    values.push(daysBetween(firstCommit, pr.mergedAt));
  }
  if (!values.length) {
    return { value: 0, unit: 'days', target: 14, status: 'unknown' };
  }
  const sum = values.reduce((acc, val) => acc + val, 0);
  const avg = Math.round(sum / values.length);
  return { value: avg, unit: 'days', target: 14, status: avg <= 14 ? 'on-track' : 'at-risk' };
}

async function getDeploymentFrequency() {
  const since = new Date(Date.now() - DAYS_FOR_DEPLOY_FREQ * 24 * 60 * 60 * 1000).toISOString();
  const url = `https://api.github.com/repos/${ORG}/${REPO}/releases?per_page=100`;
  const releases = await fetchJson(url);
  const thisWeek = releases.filter(release => new Date(release.created_at) >= new Date(since));
  return { value: thisWeek.length, unit: 'deploys/week', target: 1, status: thisWeek.length >= 1 ? 'on-track' : 'at-risk' };
}

async function getIncidentData() {
  if (!INCIDENT_TRACKER_API || !INCIDENT_TRACKER_TOKEN) {
    return [];
  }
  const url = `${INCIDENT_TRACKER_API.replace(/\/$/, '')}/incidents?since=${encodeURIComponent(
    new Date(Date.now() - DAYS_FOR_DEPLOY_FREQ * 24 * 60 * 60 * 1000).toISOString()
  )}`;
  return fetchIncidentJson(url);
}

async function getChangeFailureRate(deploysThisWeek) {
  const incidents = await getIncidentData();
  const failures = incidents.filter(incident => incident.severity === 'high' || incident.severity === 'critical').length;
  const rate = deploysThisWeek > 0 ? Math.round((failures / deploysThisWeek) * 100) : 0;
  return { value: rate, unit: '%', target: 5, status: rate <= 5 ? 'on-track' : 'at-risk', failures };
}

async function getMttr() {
  const incidents = await getIncidentData();
  const resolved = incidents.filter(i => i.resolved_at && i.created_at);
  if (!resolved.length) {
    return { value: 0, unit: 'minutes', target: 30, status: 'unknown' };
  }
  const durations = resolved.map(i => Math.round((new Date(i.resolved_at) - new Date(i.created_at)) / (1000 * 60)));
  const avg = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
  return { value: avg, unit: 'minutes', target: 30, status: avg <= 30 ? 'on-track' : 'at-risk' };
}

function formatSlackMessage(metrics) {
  const fields = [
    `*Lead Time:* ${metrics.leadTime.value} ${metrics.leadTime.unit} (${metrics.leadTime.status})`,
    `*Deployment Frequency:* ${metrics.deploymentFrequency.value} ${metrics.deploymentFrequency.unit} (${metrics.deploymentFrequency.status})`,
    `*Change Failure Rate:* ${metrics.changeFailureRate.value}${metrics.changeFailureRate.unit} (${metrics.changeFailureRate.status})`,
    `*MTTR:* ${metrics.mttr.value} ${metrics.mttr.unit} (${metrics.mttr.status})`,
  ];

  return {
    text: 'Factory Delivery KPI Report',
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: '*Weekly Delivery KPI Report*' } },
      { type: 'section', text: { type: 'mrkdwn', text: fields.join('\n') } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: `Repository: ${ORG}/${REPO}` }] },
    ],
  };
}

function csvLine(metrics) {
  const timestamp = new Date().toISOString();
  // Explicitly coerce to Number to prevent HTTP taint from flowing into the file.
  const leadTime = Number(metrics.leadTime.value);
  const deployFreq = Number(metrics.deploymentFrequency.value);
  const cfr = Number(metrics.changeFailureRate.value);
  const mttr = Number(metrics.mttr.value);
  return `${timestamp},${leadTime},${deployFreq},${cfr},${mttr}\n`;
}

async function postSlackMessage(payload) {
  const response = await fetch(SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Slack post failed ${response.status}: ${await response.text()}`);
  }
}

async function writeCsv(metrics) {
  const fs = await import('fs/promises');
  const line = csvLine(metrics);
  await fs.appendFile('kpi-history.csv', line, 'utf8');
}

async function main() {
  try {
    const leadTime = await getLeadTime();
    const deploymentFrequency = await getDeploymentFrequency();
    const changeFailureRate = await getChangeFailureRate(deploymentFrequency.value);
    const mttr = await getMttr();

    const metrics = { leadTime, deploymentFrequency, changeFailureRate, mttr };
    console.log('KPI metrics:', JSON.stringify(metrics, null, 2));

    await postSlackMessage(formatSlackMessage(metrics));
    await writeCsv(metrics);

    console.log('✅ KPI report posted and history updated.');
    process.exit(0);
  } catch (error) {
    console.error('Error generating KPI report:', error);
    process.exit(1);
  }
}

main();
