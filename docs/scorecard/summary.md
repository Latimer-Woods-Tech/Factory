# Launch Readiness Scorecard

*Generated: 2026-05-18T11:31:21.390416+00:00 · Reporting day: 2026-05-18*

## Org composite

**22.8 / 100** — Latimer-Woods-Tech (portfolio)

| Dimension | Weight | Score | Detail |
|---|--:|--:|---|
| conformance | 40% | 34 | avg cohesion across 5 apps |
| cost | 20% | 0 | worst-cap utilisation 251% |
| mrr | 20% | — | MRR is 0 — Stage 2 not yet generating recurring |
| reliability | 20% | — | awaiting Sentry user-facing error rate (#723) |

## Per-app scorecard

| Repo | Composite | Conformance | Completion | Reliability |
|---|--:|--:|--:|--:|
| **HumanDesign** (HD) | **52.3** | 41 | 75 | — |
| **xico-city** (XC) | **34.7** | 52 | 0 | — |
| **factory-admin-studio** (FA) | **19.3** | 29 | 0 | — |
| **cypher-healing** (CH) | **16.7** | 25 | 0 | — |
| **capricast** (CC) | **16.0** | 24 | 0 | — |

## Notes on dimensions reporting `—`

- **Reliability** awaits per-app Sentry user.id emission (issue #723 — `@lwt/monitoring` adoption).
- **MRR** is excluded from the org score until Stripe MRR > 0 (Stage 2 acquisition target).
  Dimensions with no data are excluded from the weighted average rather than scored as 0,
  so the score reflects what we can measure today, not penalise what we haven't wired yet.

## Targets

- **Stage 2 exit:** org composite ≥ 60, every dimension scoring (no `—`)
- **Stage 4 exit:** every per-app composite ≥ 70 (matches conformance shadow threshold)
- **Stage 5 exit:** every per-app composite ≥ 80 + privacy/a11y conformance ≥ 80
