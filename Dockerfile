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
CMD ["./node_modules/.bin/prisma", "migrate", "deploy"]
