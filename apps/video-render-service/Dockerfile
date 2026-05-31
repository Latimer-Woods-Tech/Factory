# Energy Blueprint Video Engine render service (I1 Slice 1, Wave 2).
#
# Node + real Chromium (via the Playwright base image, which ships Chromium and
# every OS library Remotion's headless render needs) + ffmpeg. This is a Cloud
# Run service, NEVER a Cloudflare Worker — Remotion and ffmpeg require Node.js
# and real compute.
#
# IMPORTANT: build context is the REPO ROOT (cloudbuild.yaml builds with `.`),
# because the service depends on the local `@latimer-woods-tech/*` packages via
# `file:` and must compile their `dist/` in dependency order before installing.
#
#   docker build -f apps/video-render-service/Dockerfile -t video-render-service .

# ---------------------------------------------------------------------------
# Stage 1 — build the local packages (dependency order) + the service.
# ---------------------------------------------------------------------------
FROM mcr.microsoft.com/playwright:v1.60.0-noble AS build
WORKDIR /repo

# Build the local package dependency chain in CLAUDE.md order. The render
# service consumes `video` (signed contract + private Stream upload) and
# `video-studio` (composition + blueprint segment); video-studio needs its
# Remotion devDeps to emit the .d.mts the service typechecks against.
COPY packages/errors        ./packages/errors
COPY packages/monitoring    ./packages/monitoring
COPY packages/logger        ./packages/logger
COPY packages/video         ./packages/video
COPY packages/video-studio  ./packages/video-studio

RUN set -eux; \
    for pkg in errors monitoring logger video; do \
      cd "/repo/packages/$pkg"; npm ci --ignore-scripts; npm run build; \
    done; \
    cd /repo/packages/video-studio; npm install --no-audit --no-fund; npm run build

# Install + build the service against the freshly built local packages.
COPY apps/video-render-service/package.json ./apps/video-render-service/package.json
WORKDIR /repo/apps/video-render-service
RUN npm install --no-audit --no-fund
COPY apps/video-render-service/tsconfig.json apps/video-render-service/.eslintrc.json ./
COPY apps/video-render-service/src ./src
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2 — runtime. Same Playwright base (Chromium present) + ffmpeg.
# ---------------------------------------------------------------------------
FROM mcr.microsoft.com/playwright:v1.60.0-noble
WORKDIR /repo/apps/video-render-service
ENV NODE_ENV=production

# ffmpeg for the H.264 baseline + AAC re-encode step.
USER root
RUN apt-get update -qq \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*

# Bring the built local packages + the service (with node_modules + dist).
COPY --from=build /repo/packages ./../../packages
COPY --from=build /repo/apps/video-render-service/node_modules ./node_modules
COPY --from=build /repo/apps/video-render-service/dist ./dist
COPY --from=build /repo/apps/video-render-service/package.json ./package.json

EXPOSE 8080
CMD ["node", "dist/server.js"]
