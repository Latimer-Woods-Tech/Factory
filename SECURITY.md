# Security Policy

## Supported Versions

| Branch / Release | Supported |
| ---------------- | --------- |
| `main`           | ✅ Yes    |
| Older tags       | ❌ No     |

Only the current `main` branch receives security fixes. Pin to `@main` or a specific tag and watch this repository for advisories.

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Report privately through one of the following channels:

- **Email**: security@latimer-woods-tech.com  
- **GitHub Security Advisories**: [Submit a private advisory](https://github.com/Latimer-Woods-Tech/factory/security/advisories/new)

We will acknowledge receipt within **48 hours** and provide a resolution timeline within **7 business days**.

For critical issues (remote code execution, credential exposure, privilege escalation) we target an emergency patch within **24 hours**.

## Scope

This repository is part of the [Factory](https://github.com/Latimer-Woods-Tech/factory) shared infrastructure platform. In-scope assets include:

- Shared TypeScript packages (`packages/`)
- Cloudflare Worker applications (`apps/`)
- GitHub Actions reusable workflows (`.github/workflows/_*.yml`)
- Build and deployment scripts (`scripts/`)

Security issues in upstream dependencies (Cloudflare, Neon, GitHub, Stripe, Anthropic, etc.) should be reported directly to those vendors. If you discover that factory code misuses an upstream API in a security-relevant way, that **is** in scope — please report it.

## Disclosure Policy

We follow **coordinated responsible disclosure**:

1. Reporter submits the vulnerability privately (email or GitHub Advisory).
2. We confirm receipt within 48 hours.
3. We investigate, reproduce, and develop a fix.
4. We notify the reporter when the fix is deployed.
5. Reporter may publish full details after the fix is live, or after a mutually agreed embargo period — whichever comes first.

Please give us reasonable time to address vulnerabilities before public disclosure.

## Out of Scope

The following are **not** in scope for this program:

- Vulnerabilities in third-party services (Cloudflare, GitHub, Neon, Stripe, etc.) that do not stem from our code
- Issues that require physical access to infrastructure
- Social engineering or phishing attacks against team members
- Denial-of-service attacks against public infrastructure
- Issues already publicly known or previously disclosed
- Theoretical vulnerabilities without a working proof of concept

## Recognition

We appreciate responsible disclosure. With your permission, we will acknowledge researchers by name (or alias) in the relevant security advisory and release notes.
