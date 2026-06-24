# Billing-proof render runner — runs the Capricast scheduled-content render
# pipeline as a Cloud Run Job (off GitHub Actions). Build context = repo root.
#
#   docker build -f tools/render-runner/Dockerfile -t render-runner .
#
# The 9-package build chain + apps/video-studio install + Remotion's headless
# browser are baked into the image so a Job execution only renders (no installs).
FROM node:24-bookworm-slim

# System deps: ffmpeg (re-encode step), jq + curl + awscli (pipeline glue + R2),
# and the Chromium runtime libraries Remotion needs to launch headless.
RUN apt-get update -qq && apt-get install -y --no-install-recommends \
      ffmpeg jq curl ca-certificates bash awscli \
      libnss3 libdbus-1-3 libatk1.0-0 libgbm1 libasound2 libxrandr2 \
      libxkbcommon0 libxfixes3 libxcomposite1 libxdamage1 libxext6 \
      libatk-bridge2.0-0 libpango-1.0-0 libcairo2 libcups2 libxshmfence1 \
      fonts-liberation fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
# NOTE: deliberately NOT setting NODE_ENV=production — npm omits devDependencies
# under it, and tsup/typescript (needed to BUILD the packages) are devDeps.
ENV REPO_ROOT=/app \
    GCP_PROJECT=factory-495015 \
    REMOTION_DISABLE_HEADLESS_WARNING=1

# Copy only what the render needs (see .dockerignore — node_modules/dist excluded
# so installs are fresh and deterministic).
COPY packages/ packages/
COPY apps/video-studio/ apps/video-studio/
COPY scripts/ scripts/
COPY tools/render-runner/entrypoint.sh tools/render-runner/entrypoint.sh

# Build the local package dependency chain in order (mirrors render-video.yml).
# `npm install` (not `npm ci`) installs each package's devDeps (tsup/typescript)
# straight from package.json — robust to lockfile state in the staged context.
# --ignore-scripts skips each package's prepare/coverage gate; we only need dist/.
RUN set -eux; \
    for pkg in bodygraph errors monitoring logger neon llm video schedule video-studio; do \
      echo "=== build packages/$pkg ==="; \
      ( cd "packages/$pkg" \
        && npm install --ignore-scripts --no-audit --no-fund \
        && test -x node_modules/.bin/tsup \
        && npm run build ); \
    done

# Install the Remotion app deps (ts-node + @remotion/*) and bake the browser.
RUN set -eux; \
    cd apps/video-studio && npm install --no-audit --no-fund && \
    npx remotion browser ensure

RUN chmod +x tools/render-runner/entrypoint.sh
ENTRYPOINT ["bash", "/app/tools/render-runner/entrypoint.sh"]
