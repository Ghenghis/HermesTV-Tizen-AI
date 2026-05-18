FROM node:20-alpine
WORKDIR /app
# Build context is the REPO ROOT (set in upstream/docker-vps/VPS_COMPOSE.yml),
# so paths below are repo-root-relative. This lets us COPY cross-app
# resources (layout manifests + upstream catalog) that the API serves.
COPY services/hermes-tv-api/package*.json ./
# npm 10+ removed --only=production (deprecated since npm 7); --omit=dev is
# the supported replacement and is forward-compatible with npm 11+.
RUN npm ci --omit=dev
COPY services/hermes-tv-api/src/ ./src/
# Bake cross-repo resources at fixed container paths. Routes resolve
# these via env-var overrides (HERMES_MANIFESTS_DIR, HERMES_UPSTREAM_CATALOG)
# falling back to repo-relative paths for local dev outside Docker.
COPY apps/hermes-web-tv/src/layouts/manifests/ /app-resources/layouts/
COPY upstream/apps-catalog.json /app-resources/apps-catalog.json
ENV HERMES_MANIFESTS_DIR=/app-resources/layouts
ENV HERMES_UPSTREAM_CATALOG=/app-resources/apps-catalog.json
ENV NODE_ENV=production
# Phase 1.5: container defaults to 3011 (VPS port 3001 already bound by
# Dave's next-server — see docs/20_VPS_PHASE_1_AUDIT_FINDINGS.md). Local dev
# without Docker uses 3001 via src/index.js fallback. Compose can override.
ENV PORT=3011
EXPOSE 3011
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" || exit 1
CMD ["node", "src/index.js"]
