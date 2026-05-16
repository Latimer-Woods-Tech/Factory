export const metadata = {
  title: "Frontend Contribution Guide",
  description: "Setup, testing, building, and deployment for Factory frontend apps",
};

# Frontend Contribution Guide

**Last Updated:** April 28, 2026  
**Target Audience:** Frontend engineers working on Factory apps  
**Quick Start Time:** 30 minutes

---

## Local Development Setup

### 1. Clone the repo and install dependencies

```bash
git clone https://github.com/Latimer-Woods-Tech/capricast.git
cd apps/web

# Install pnpm if needed
npm install -g pnpm

# Install dependencies
pnpm install
```

### 2. Set up environment variables

Create `.env.local` (Never commit this file — use `.env.local.example`):

```bash
# Copy template
cp .env.local.example .env.local

# Fill in your dev values
NEXT_PUBLIC_API_URL=http://localhost:8787
NEXT_PUBLIC_APP_URL=http://localhost:3000
POSTHOG_API_KEY=phc_dev_...
SENTRY_DSN=https://key@dev.ingest.sentry.io/project
```

### 3. Start the development server

```bash
pnpm dev
```

Server runs at `http://localhost:3000`.

### 4. Install browser extensions

- **React Developer Tools** — Inspect component props/state
- **Redux DevTools** — Debug state management
- **Lighthouse** — Performance testing

---

## Running Tests

### Unit Tests

Test individual components:

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test --watch

# Run tests for a specific file
pnpm test VideoCard

# Generate coverage report
pnpm test:coverage

# View coverage in browser
open coverage/index.html
```

**Coverage targets:**
- Line: ≥90%
- Function: ≥90%
- Branch: ≥85%

### Integration Tests

Test user flows:

```bash
# Run integration tests only
pnpm test -- --grep "signup"

# Run E2E (requires staging environment)
pnpm test:e2e
```

### Visual Regression Tests

Test components don't change unintentionally:

```bash
# Build Storybook stories
pnpm storybook

# Generate baseline screenshots
pnpm chromatic --build-script-name build-storybook

# On PR, Chromatic automatically compares screenshots
# Review visual diffs in GitHub PR
```

---

## Building for Production

### 1. TypeScript check

```bash
pnpm type-check

# Should complete with zero errors
# If errors: ❌ Block merge
```

### 2. ESLint

```bash
pnpm lint

# Should complete with zero warnings
# Configure with --max-warnings 0 to enforce
```

### 3. Build

```bash
pnpm build

# Output: .next/ directory
# Should complete with zero warnings
```

### 4. Bundle analysis

```bash
pnpm build:analyze

# See which packages used most bytes
# Large packages are flagged
# Usually generated in .next/analyze/
```

### 5. Lighthouse audit

```bash
# Build a local production server
pnpm build
pnpm start

# In another terminal, run Lighthouse
pnpm lighthouse https://localhost:3000

# Scores should be ≥90 for:
# - Performance
# - Accessibility
# - Best Practices
# - SEO (if applicable)
```

---

## Common Issues

### ❌ "Module not found: Can't resolve '@/components/Button'"

**Cause:** TypeScript path aliases not configured  
**Fix:** Check `tsconfig.json` has:
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

### ❌ "ESLint errors in component"

**Cause:** Missing React import or `any` type  
**Fix:**
```typescript
// ✅ Good
import React from 'react';

interface Props {
  value: string;
}

export function Component({ value }: Props) {
  return <div>{value}</div>;
}

// ❌ Bad (no import, uses any)
export function Component({ value }: any) {
  return <div>{value}</div>;
}
```

### ❌ "Port 3000 is already in use"

**Cause:** Another process using port 3000  
**Fix:**
```bash
# Kill the process (macOS/Linux)
lsof -i :3000
kill <PID>

# Or use a different port
pnpm dev --port 3001
```

### ❌ "node_modules drift: dependencies mismatch"

**Cause:** `pnpm-lock.yaml` out of sync with `package.json`  
**Fix:**
```bash
# Remove and reinstall
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

### ❌ "TypeScript cache stale: errors don't match"

**Cause:** TypeScript cache not cleared  
**Fix:**
```bash
# Clear tsc cache
rm -rf .next
pnpm type-check
```

### ❌ "React 18 hydration mismatch warning"

**Cause:** Server-rendered HTML differs from client-rendered  
**Fix:**
```typescript
// ✅ Good: Use useEffect to render only on client
export function Component() {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return <div>{new Date()}</div>;
}

// ❌ Bad: renders immediate
export function Component() {
  return <div>{new Date()}</div>; // Different on server vs client
}
```

### ❌ "Styles aren't loading in production build"

**Cause:** CSS modules or Tailwind not building  
**Fix:** Check `next.config.js`:
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [{
      protocol: 'https',
      hostname: '**.example.com',
    }],
  },
};

module.exports = nextConfig;
```

---

## Performance Debugging

### React Profiler

Built-in React tool to find slow components:

```typescript
// Wrap slow component
import { Profiler } from 'react';

<Profiler
  id="VideoGrid"
  onRender={(id, phase, duration) => {
    console.log(`${id} (${phase}) took ${duration}ms`);
  }}
>
  <VideoGrid />
</Profiler>
```

Logs to console:
```
VideoGrid (mount) took 234ms
VideoGrid (update) took 45ms
```

### Chrome DevTools Performance Tab

1. Open Chrome DevTools → **Performance** tab
2. Click "Record" button
3. Interact with your app (scroll, click, etc.)
4. Click "Stop"
5. Analyze:
   - **Yellow bars:** JavaScript execution
   - **Purple bars:** Rendering
   - **Green bars:** Painting
   - Aim for < 16ms to stay at 60 FPS

### Lighthouse Performance Audit

```bash
# Built into Chrome DevTools
1. Press F12
2. Go to "Lighthouse" tab
3. Select "Performance"
4. Click "Analyze page load"

# Results show:
# - LCP (Largest Contentful Paint)
# - FID (First Input Delay)
# - CLS (Cumulative Layout Shift)
# - Web Vitals score
```

### Network Tab Debugging

```
1. Chrome DevTools → Network tab
2. Reload page
3. Look for:
   - Red circles: Failed requests
   - Large sizes: Bloated assets (images, JS bundles)
   - Slow times: Slow backend API
4. Check "Disable cache" to simulate mobile users
```

---

## Deployment Checklist

Before marbling to staging or production:

### Code Quality
- [ ] `pnpm type-check` — Zero errors
- [ ] `pnpm lint` — Zero warnings
- [ ] `pnpm test:coverage` — ≥90% lines, ≥85% branches
- [ ] Code review approved by 1+ teammate

### Performance
- [ ] `pnpm build` — Zero warnings
- [ ] `pnpm build:analyze` — No unexpected package growth
- [ ] Lighthouse score ≥90 Performance
- [ ] Bundle size < 500KB (JS + CSS)

### Accessibility & UX
- [ ] axe DevTools: Zero violations
- [ ] Manual test: Dark mode looks good
- [ ] Manual test: Mobile (iPhone SE, 375px) looks good
- [ ] Manual test: Keyboard navigation works

### Testing
- [ ] Unit tests pass
- [ ] Integration tests pass (if applicable)
- [ ] E2E tests pass (if applicable)
- [ ] No console errors or warnings

### Documentation
- [ ] Updated README (if setup changed)
- [ ] Updated env variables (if needed)
- [ ] Added JSDoc comments for public functions
- [ ] Updated CHANGELOG.md

---

## Deploying to Staging

### 1. Create a PR

```bash
git checkout -b feat/my-feature
git add .
git commit -m "feat: describe your change"
git push origin feat/my-feature
```

### 2. GitHub PR checks

Auto-runs:
- TypeScript check
- ESLint
- Unit tests
- Vitest coverage
- Build

All must pass (green checkmarks).

### 3. Staging deployment

Once PR is approved and checks pass:

```bash
# In GitHub UI, merge to main
# GitHub Actions automatically:
# 1. Builds the app
# 2. Deploys to staging.app (Cloudflare Pages)
# 3. Posts comment with staging URL
```

### 4. Test on staging

1. Click the staging URL from GitHub PR comment
2. Manual test:
   - Sign up flow
   - Play videos
   - Change theme (light/dark)
   - Check mobile responsiveness
3. Check Lighthouse: `⌘ + ⇧ + C`, then Lighthouse tab

### 5. Merge to main

Once staging tests pass, click "Squash and merge" in GitHub.

Auto-deploys to production (capricast.com) after 5 min.

---

## Production Troubleshooting

### ❌ Styles not loading on production

1. Check Cloudflare Pages build output for CSS errors
2. Check `next.config.js` for `distDir` or build issues
3. Verify Tailwind CSS is in `globals.css`
4. Clear Cloudflare cache: Settings → Caching → Purge Everything

### ❌ 404 on page that works on staging

1. Check if Next.js route exists (`pages/` or `app/`)
2. Check `next.config.js` for rewrites or redirects
3. Verify Cloudflare Routes in `_routes.json`

### ❌ Old version still visible on production

1. Hard refresh: `⌘ + ⇧ + R` (clear browser cache)
2. Check Cloudflare Pages deployment status
3. Check browser cache: DevTools → Network → "Disable cache" → reload

### ❌ API calls returning 401 Unauthorized

1. Check `NEXT_PUBLIC_API_URL` points to production API
2. Check JWT token is being sent: DevTools → Network → Headers → `Authorization`
3. Check JWT token not expired
4. Verify API endpoint is authenticated correctly

---

## Performance Optimization Tips

### Code Splitting

```typescript
// ✅ Good: Lazy load heavy components
import dynamic from 'next/dynamic';

const VideoPlayer = dynamic(() => import('../components/VideoPlayer'), {
  loading: () => <div>Loading...</div>,
  ssr: false, // Don't server-render large component
});
```

### Image Optimization

```typescript
// ✅ Good: Use Next.js Image component
import Image from 'next/image';

<Image
  src="/poster.jpg"
  alt="Video poster"
  width={400}
  height={300}
  placeholder="blur"
  blurDataURL={blurredImage}
/>
```

### CSS Optimization

```typescript
// ✅ Good: Use CSS modules (scoped)
import styles from './Button.module.css';

export function Button() {
  return <button className={styles.button}>Click</button>;
}

// ✅ Good: Use Tailwind (auto-purges unused CSS)
export function Button() {
  return <button className="px-4 py-2 bg-blue-600">Click</button>;
}
```

---

## Related Docs

- [Frontend Standards](frontend-standards.mdx) — Quality gates, testing, accessibility
- [Design Standards](design-standards.mdx) — Visual language, component patterns
- [Definition of Ready & Done](definition-of-ready-done.md) — PR checklist
- Next.js Docs: https://nextjs.org/docs

---

**Version:** 1.0  
**Maintained by:** Frontend team  
**Last reviewed:** April 28, 2026
