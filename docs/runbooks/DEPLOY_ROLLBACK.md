# Deploy Rollback Runbook

_Owner: adrper79-dot. Last updated 2026-05-08._

## Purpose
Roll back any production Worker to its previous deployment within 5 minutes of detecting a regression.

## Detection signals
- Sentry error rate spike (issue created with `priority:P0`)
- Synthetic monitor smoke failure (`Smoke — Prime Self Production` red, etc.)
- PostHog event-rate anomaly
- Customer report

## Per-app commands

```bash
# General pattern
wrangler deployments list --name <worker-name>
wrangler rollback --name <worker-name> <previous-version-id>

# Verify
curl -s -o /dev/null -w "%{http_code}" https://<worker-prod-url>/healthz
```

| App | Worker name | Custom domain | Smoke check |
|---|---|---|---|
| prime-self | `prime-self-worker` | selfprime.net | `curl https://selfprime.net/api/health` |
| ijustus | `ijustus-worker` | ijustus.com | `curl https://ijustus.com/api/health` |
| videoking | `videoking-worker` | capricast.com | `curl https://capricast.com/api/health` |
| neighbor-aid | `neighbor-aid-worker` | TBD | TBD |
| wordis-bond | `wordis-bond-worker` | wordisbond.com | `curl https://wordisbond.com/api/health` |
| the-calling | `the-calling-worker` | thecalling.app | `curl https://thecalling.app/api/health` |
| factory-admin | `factory-admin-worker` | admin.latwoodtech.com | `curl https://admin.latwoodtech.com/healthz` |
| xpelevator | `xpelevator-worker` | xpelevator.com | `curl https://xpelevator.com/api/health` |
| HumanDesign | `human-design-worker` | TBD | TBD |
| xico-city | `xico-city-worker` | TBD | `curl https://xico-city-processor-jynwmsqayq-uc.a.run.app/health` |

## Rollback decision tree

1. **Error rate > 5x baseline within 5min of deploy** → rollback immediately, investigate after.
2. **Error rate < 5x but smoke failed** → check if external dep (Stripe, Neon) is the cause. If yes, no rollback needed. If no, rollback.
3. **Customer-only report** → reproduce first. If repro, rollback. If not, gather more reports.
4. **PostHog anomaly with no Sentry signal** → likely false alarm. Watch for 15min before rollback.

## Post-rollback

1. Open issue: `[ROLLBACK] <app> <date>` with Sentry link, version IDs, customer impact.
2. Tag the bad commit/PR for postmortem.
3. Add test that catches the regression.
4. Schedule postmortem within 48h.

## Last drill
Never run. Schedule one for 2026-06-01.
