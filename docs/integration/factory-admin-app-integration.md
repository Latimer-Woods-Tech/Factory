# Factory Admin: App Integration Guide

**Last Updated:** April 28, 2026  
**Phase:** Phase D (T4.4)  
**Owner:** Platform Team  
**Audience:** App developers, Factory Admin maintainers

---

## Overview

Factory Admin is a portfolio-level dashboard that consumes standardized telemetry from every Factory app. This guide explains how to:

1. Implement the three required telemetry endpoints
2. Wire them into Factory Admin for real-time visibility
3. Debug if metrics are missing

---

## Step 1: Implement Telemetry Endpoints

Every app must expose three endpoints per the [Factory Admin Telemetry Contract](../packages/factory-admin-telemetry-contract.mdx):

### Endpoint: `GET /api/admin/health`

**Purpose:** Health status, SLO tracking, error budget

**Required Response:**
```json
{
  "status": "green",
  "slo": {
    "status": "green",
    "error_budget_remaining_percent": 85.2,
    "latency_p99_ms": 340,
    "uptime_percent": 99.95,
    "period": "2026-04-28"
  },
  "dependencies": {
    "database": "healthy",
    "stripe": "healthy",
    "cloudflare": "healthy"
  }
}
```

**Status Codes:**
- `200 OK` — All green
- `503 Service Unavailable` — Any failing dependency or SLO breach

### Endpoint: `GET /api/admin/metrics`

**Purpose:** Business metrics, revenue health, user trends

**Required Response:**
```json
{
  "revenue": {
    "total_usd": 125400.50,
    "period": "month",
    "trend": "↑ 12.3%",
    "by_source": {
      "subscriptions": 80200,
      "one_time": 45200
    }
  },
  "users": {
    "total": 2840,
    "active_30d": 2100,
    "churn_rate_percent": 2.1
  },
  "top_issues": [
    {
      "issue": "Video transcoding timeout",
      "count": 12,
      "severity": "high",
      "status": "investigating"
    }
  ]
}
```

### Endpoint: `GET /api/admin/events`

**Purpose:** Real-time event stream for audit trail, anomaly detection

**Required Response:**
```json
{
  "events": [
    {
      "type": "new_user",
      "timestamp": "2026-04-28T14:32:10Z",
      "user_id": "user_abc123",
      "details": {}
    },
    {
      "type": "transaction_failed",
      "timestamp": "2026-04-28T14:31:45Z",
      "user_id": "user_xyz789",
      "details": {
        "reason": "card_declined",
        "amount_usd": 99.99
      }
    }
  ],
  "total": 245,
  "has_more": true,
  "next_cursor": "evt_2026-04-28T14:30:00Z"
}
```

---

## Step 2: Register with Factory Admin

Add your app to the service registry:

1. Open `docs/service-registry.yml`
2. Add your app under `admin_telemetry_consumers`:
   ```yaml
   - name: my-app
     health_endpoint: https://my-app.adrper79.workers.dev/api/admin/health
     metrics_endpoint: https://my-app.adrper79.workers.dev/api/admin/metrics
     events_endpoint: https://my-app.adrper79.workers.dev/api/admin/events
     owner: your-team
     datadog_integration: true  # optional
   ```
3. Commit and push
4. Factory Admin will auto-discover and poll every 5 minutes

---

## Step 3: Verify Integration

In Factory Admin dashboard:

1. Go to **Portfolio → Apps**
2. Find your app in the list
3. Click **Health Check**
4. Verify all three endpoints return `200 OK`
5. Check **Metrics** tab to see your data populated

If endpoints don't respond:

- **Verify auth:** All endpoints require `Authorization: Bearer {token}` with `admin:read` permission
- **Check CORS:** Factory Admin makes cross-origin requests; ensure CORS headers allow `https://admin-studio-staging.adrper79.workers.dev`
- **Test manually:** `curl -H "Authorization: Bearer $(echo $JWT_SECRET | ...)" https://my-app.adrper79.workers.dev/api/admin/health`

---

## Authorization

All three endpoints require:

- **Permission:** `admin:read` from Factory Auth ([@latimer-woods-tech/auth](../packages/auth/))
- **Rate limit:** 60 requests/min per app (Factory Admin gets dedicated quota)
- **Headers:** `Authorization: Bearer {token}`, standard Factory Hono middleware

Example Hono middleware:

```typescript
import { auth } from '@latimer-woods-tech/auth';

app.use('/api/admin/*', auth(), async (c, next) => {
  if (!c.get('user')?.permissions?.includes('admin:read')) {
    return c.json({ error: 'Unauthorized' }, 403);
  }
  await next();
});
```

---

## Dashboards

Factory Admin exposes these visualizations:

- **Portfolio Health:** SLO status across all apps (red/yellow/green)
- **Revenue Trends:** Total revenue and growth rate (daily, weekly, monthly)
- **User Cohorts:** Signups, active users, churn (by cohort, geography, source)
- **Issue Hotlist:** Top 10 errors across portfolio (by app, severity, frequency)
- **Incident Timeline:** Recent incidents with response times (MTTD, MTTR)

Each visualization refreshes from the telemetry endpoints every 5 minutes.

---

## Troubleshooting

**Q: My metrics aren't appearing in Factory Admin?**

A: Check the event polling logs:
- Go to **Portfolio → Settings → Integration Logs**
- Look for your app name
- Verify endpoint is responding with correct schema
- Check timestamp format (ISO 8601 UTC required)

**Q: How do I manually trigger a refresh?**

A: In Factory Admin, click **Refresh** on the app card. This will immediately poll all three endpoints.

**Q: Can I test locally?**

A: Yes. Start Factory Admin locally and update `service-registry.yml` to point to `localhost:8787`:
```yaml
health_endpoint: http://localhost:8787/api/admin/health
```

---

## See Also

- [Factory Admin Telemetry Contract](../packages/factory-admin-telemetry-contract.mdx) — Detailed schema specs
- [SLO Framework](../runbooks/slo-framework.md) — How to calculate error_budget_remaining_percent and latency_p99
- [@latimer-woods-tech/auth](../packages/auth/) — JWT token generation and validation
- [Factory Admin README](../../apps/admin-studio/README.md) — Deployment and configuration
