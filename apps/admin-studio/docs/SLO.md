# Admin Studio SLO

## Service level objectives

| Metric | Target | Window |
|---|---|---|
| Availability | ≥ 99.9% | Rolling 30 days |
| API p95 latency (read routes) | < 200ms warm / < 500ms cold | Rolling 24 hours |
| API p95 latency (write routes) | < 800ms warm / < 1500ms cold | Rolling 24 hours |
| 5xx error rate | < 0.1% | Rolling 30 days |

## Monitoring signals

- Sentry captures unhandled Worker errors via `@latimer-woods-tech/monitoring`.
- Structured logs include `request_id` and route context for each request.
- Deploy workflow uploads sourcemaps so stack traces are symbolicated.

## Alerts

- Error spike: >10 errors/minute in Sentry (critical).
- Elevated 5xx: >1% for 5 minutes (high).
- p95 budget breach: >1.5x target for 10 minutes (high).
