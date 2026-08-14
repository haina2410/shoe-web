# syntax=docker/dockerfile:1.7
ARG NODE_VERSION=24.16.0

FROM node:${NODE_VERSION}-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs --create-home nextjs

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS generated
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
COPY prisma ./prisma
COPY prisma.config.ts tsconfig.json ./
RUN npx prisma generate

FROM generated AS builder
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
ENV BETTER_AUTH_SECRET=build-only-not-a-production-secret
ENV BETTER_AUTH_URL=http://localhost:3000
COPY . .
RUN npm run build

FROM base AS app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV UPLOAD_DIR=/data/uploads
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
RUN mkdir -p /data/uploads && chown nextjs:nodejs /data/uploads
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]

FROM generated AS worker
ENV NODE_ENV=production
COPY . .
RUN chown -R nextjs:nodejs /app
USER nextjs
CMD ["./node_modules/.bin/tsx", "src/worker/index.ts"]

FROM worker AS migrate
CMD ["./scripts/migrate-and-seed.sh"]

FROM base AS dashboard-builder
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/pg-boss
RUN git init \
  && git remote add origin https://github.com/timgit/pg-boss.git \
  && git fetch --depth 1 origin f869cc90c3324c72807072523e89c776dd5f71cd \
  && git checkout --detach FETCH_HEAD
RUN npm ci --ignore-scripts
WORKDIR /opt/pg-boss/packages/dashboard
RUN npm ci
RUN PGBOSS_DASHBOARD_BASE_PATH=/admin_jobs npm run build \
  && npm prune --omit=dev

FROM base AS dashboard
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
COPY --from=dashboard-builder --chown=nextjs:nodejs /opt/pg-boss/packages/dashboard/build ./build
COPY --from=dashboard-builder --chown=nextjs:nodejs /opt/pg-boss/packages/dashboard/node_modules ./node_modules
COPY --from=dashboard-builder --chown=nextjs:nodejs /opt/pg-boss/LICENSE ./licenses/pg-boss-LICENSE
USER nextjs
EXPOSE 3000
CMD ["node", "build/server.js"]

FROM deps AS smoke
ENV NODE_ENV=test
COPY playwright.smoke.config.ts ./
COPY e2e/production-smoke.spec.ts ./e2e/production-smoke.spec.ts
USER nextjs
CMD ["npm", "run", "test:smoke"]
