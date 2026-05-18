FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src/ ./src/
ENV NODE_ENV=production
# Phase 1.5: container defaults to 3011 (VPS port 3001 already bound by
# Dave's next-server — see docs/20_VPS_PHASE_1_AUDIT_FINDINGS.md). Local dev
# without Docker uses 3001 via src/index.js fallback. Compose can override.
ENV PORT=3011
EXPOSE 3011
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s \
  CMD wget -qO- "http://localhost:${PORT}/health" || exit 1
CMD ["node", "src/index.js"]
