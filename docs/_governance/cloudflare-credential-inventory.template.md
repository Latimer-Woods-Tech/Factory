# Cloudflare Credential Inventory Template

**Last Updated:** 2026-06-16
**Status:** Template

Use this template to track Cloudflare credentials without recording secret values. Never paste token strings, refresh tokens, API keys, client secrets, or recovery codes into this inventory.

| Token name | Class | Owner | Backup owner | Environment | Cloudflare account | Resource scope | Permission groups | System/repo | Secret store location | Created | Expires | Rotation owner | Next rotation | Approval reference | Last verified | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `cf-example-prod-workers-deploy-20260616` | `cf-ci-deploy-prod` | platform | security | prod | account alias only | Worker/project alias only | `Workers Scripts Write` | repo/service name | secret store path only | 2026-06-16 | 2026-08-15 | platform | 2026-08-01 | ticket/link | 2026-06-16 | Example row; delete before use. |

## Review Checklist

1. No credential value is present.
2. Every token has an owner and backup owner.
3. Every token has an expiration date.
4. Deploy tokens do not have token-management permissions.
5. Production and non-production credentials are separate.
6. Shared automation uses account-owned tokens where Cloudflare supports the endpoint.
7. The recorded secret store location is a reference path, not the secret itself.
