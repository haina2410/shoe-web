# Day 10 Production Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Leaf Shoes to its existing Komodo-managed VPS through the existing `cloudflared` system service, with reproducible containers, durable data, safe migrations, health checks, remote smoke tests, and an operator runbook.

**Architecture:** A Git-backed Komodo Stack runs PostgreSQL, a Next.js standalone app, and a separate pg-boss worker. One-shot migration and request-only Playwright smoke targets run through an idempotent deployment script; the app is bound only to host loopback for `cloudflared`, and PostgreSQL/uploads use persistent Docker volumes.

**Tech Stack:** Next.js 16.2.11 standalone output, Node.js 24 Debian slim, Prisma 7.9, PostgreSQL 17 Alpine, Docker Compose, Komodo, Cloudflare Tunnel, Vitest 4, Playwright 1.61 request API.

## Global Constraints

- Read the relevant guides in `node_modules/next/dist/docs/` before changing any Next.js configuration or route.
- VPS and Komodo already exist; `cloudflared` runs as a system service on the VPS.
- Do not add Caddy, Nginx, Traefik, Grafana, Redis, Kubernetes, or another public ingress.
- Publish the app only as `127.0.0.1:${APP_HOST_PORT:-3000}:3000`; never publish PostgreSQL.
- Keep PostgreSQL data and `UPLOAD_DIR` on persistent Docker volumes.
- Real secrets live in Komodo environment only; never put them in Git, build args, image layers, logs, Playwright reports, or test snapshots.
- `MAIL_FROM=no-reply@leafshoesvietnam.com` is allowed only after Resend domain verification; `MAIL_REPLY_TO=leafshoesvietnam@gmail.com`.
- Do not run `prisma db seed` automatically during ordinary deployment.
- Migrate before replacing app/worker; a failed build or migration must leave the current app/worker release running.
- Remote automatic smoke tests must not create orders, payments, users, uploads, or other production data.
- Run every behavior change RED → GREEN and commit after each independently reviewable task.
- Every implementation and review subagent must use model `gpt-5.6-terra`.

## File Map

| File | Responsibility |
|---|---|
| `src/app/api/health/route.ts` | Non-cacheable app/database readiness endpoint |
| `src/app/api/health/route.test.ts` | Success/failure/security contract for readiness |
| `next.config.ts` | Enable Next.js standalone output |
| `Dockerfile` | Multi-stage app, worker, migrate, and request-only smoke images |
| `.dockerignore` | Keep secrets, local artifacts, uploads, and Git metadata out of build context |
| `docker-compose.prod.yml` | Production service graph, loopback binding, health checks, and volumes |
| `.env.production.example` | Safe, complete operator environment template |
| `.gitignore` | Allow the production example while continuing to ignore real env files |
| `scripts/validate-production-env.mjs` | Report missing variable names without revealing values |
| `scripts/deploy-production.sh` | Build → database → migrate → app/worker → health → smoke workflow |
| `scripts/backup-production.sh` | Timestamped PostgreSQL/upload backup without retention deletion |
| `src/deployment/production-env.test.ts` | Validator and secret-redaction contract |
| `src/deployment/deployment-assets.test.ts` | Static deployment-file security and topology contracts |
| `playwright.smoke.config.ts` | Remote-only Playwright configuration with no local web server |
| `e2e/production-smoke.spec.ts` | Non-mutating health/storefront/login request checks |
| `docs/08-production-runbook.md` | Komodo, Tunnel, launch, backup, restore drill, rollback, and diagnosis |
| `README.md` | Link the production runbook and expose operator commands |

---

### Task 1: Database-aware readiness endpoint

**Files:**
- Create: `src/app/api/health/route.test.ts`
- Create: `src/app/api/health/route.ts`

**Interfaces:**
- Consumes: `prisma` from `@/lib/prisma`, including `$queryRaw`.
- Produces: `GET /api/health` returning `{ status: "ok" }` with `200`, or `{ status: "unavailable" }` with `503`; both responses send `Cache-Control: no-store`.

- [ ] **Step 1: Re-read the Next.js 16 Route Handler guidance**

Run:

```bash
sed -n '1,260p' node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md
```

Expected: confirm Route Handlers use the Web `Response` API and can export route-segment config.

- [ ] **Step 2: Write the failing route tests**

Create `src/app/api/health/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryRawMock } = vi.hoisted(() => ({
  queryRawMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: queryRawMock },
}));

import { GET, dynamic } from "@/app/api/health/route";

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns non-cacheable 200 when the database is ready", async () => {
    queryRawMock.mockResolvedValue([{ "?column?": 1 }]);

    const response = await GET();

    expect(dynamic).toBe("force-dynamic");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "ok" });
    expect(queryRawMock).toHaveBeenCalledTimes(1);
  });

  it("returns a generic non-cacheable 503 without leaking database errors", async () => {
    queryRawMock.mockRejectedValue(
      new Error("password=do-not-leak host=private-db"),
    );

    const response = await GET();
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toBe('{"status":"unavailable"}');
    expect(body).not.toContain("do-not-leak");
    expect(body).not.toContain("private-db");
  });
});
```

- [ ] **Step 3: Run the focused test and confirm RED**

Run:

```bash
npx vitest run src/app/api/health/route.test.ts
```

Expected: FAIL because `src/app/api/health/route.ts` does not exist.

- [ ] **Step 4: Implement the minimal route**

Create `src/app/api/health/route.ts`:

```ts
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

export async function GET(): Promise<Response> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok" }, { status: 200, headers });
  } catch {
    return Response.json(
      { status: "unavailable" },
      { status: 503, headers },
    );
  }
}
```

- [ ] **Step 5: Run focused and related route tests**

Run:

```bash
npx vitest run src/app/api/health/route.test.ts src/app/api/webhooks/sepay/route.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/health/route.ts src/app/api/health/route.test.ts
git commit -m "feat(deploy): add database readiness endpoint"
```

---

### Task 2: Reproducible production image targets

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`
- Create: `src/deployment/deployment-assets.test.ts`
- Modify: `next.config.ts`

**Interfaces:**
- Consumes: current `package-lock.json`, `prisma.config.ts`, `prisma/`, `src/worker/index.ts`, and Next.js build output.
- Produces: Docker targets `app`, `worker`, and `migrate`; Task 5 later adds target `smoke`.

- [ ] **Step 1: Re-read the installed Next.js deployment docs**

Run:

```bash
sed -n '1,220p' node_modules/next/dist/docs/01-app/01-getting-started/17-deploying.md
sed -n '1,220p' node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md
sed -n '1,360p' node_modules/next/dist/docs/01-app/02-guides/self-hosting.md
```

Expected: confirm standalone does not automatically copy `public` or `.next/static`, runtime server env remains available, and self-hosting should use graceful shutdown.

- [ ] **Step 2: Write failing deployment asset contracts**

Create `src/deployment/deployment-assets.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function text(path: string): Promise<string> {
  return readFile(path, "utf8");
}

describe("production deployment assets", () => {
  it("builds a Next.js standalone server", async () => {
    expect(await text("next.config.ts")).toMatch(/output:\s*["']standalone["']/);
  });

  it("defines non-root app, worker, and migration targets", async () => {
    const dockerfile = await text("Dockerfile");

    expect(dockerfile).toMatch(/AS app\b/);
    expect(dockerfile).toMatch(/AS worker\b/);
    expect(dockerfile).toMatch(/AS migrate\b/);
    expect(dockerfile).toContain("/app/.next/standalone");
    expect(dockerfile).toContain("/app/.next/static");
    expect(dockerfile).toContain("/app/public");
    expect(dockerfile.match(/USER nextjs/g)?.length).toBeGreaterThanOrEqual(3);
    expect(dockerfile).not.toMatch(/ARG\s+(DATABASE_URL|.*SECRET|.*PASSWORD)/);
  });

  it("excludes secrets and machine-local state from the build context", async () => {
    const ignored = await text(".dockerignore");

    for (const entry of [
      ".git",
      ".env*",
      "node_modules",
      ".next",
      "uploads",
      "test-results",
      "playwright-report",
    ]) {
      expect(ignored).toContain(entry);
    }
  });
});
```

- [ ] **Step 3: Confirm RED**

Run:

```bash
npx vitest run src/deployment/deployment-assets.test.ts
```

Expected: FAIL because the Docker assets and standalone config do not exist.

- [ ] **Step 4: Enable standalone output**

Replace the current config in `next.config.ts` with:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
```

- [ ] **Step 5: Add the Docker build context exclusions**

Create `.dockerignore`:

```dockerignore
.git
.github
.env*
!.env.example
!.env.production.example
.next
node_modules
coverage
uploads
test-results
playwright-report
blob-report
playwright/.cache
.worktrees
.superpowers
npm-debug.log*
*.tsbuildinfo
```

- [ ] **Step 6: Add the multi-stage Dockerfile**

Create `Dockerfile` with these exact stages and responsibilities:

```dockerfile
# syntax=docker/dockerfile:1.7
ARG NODE_VERSION=24.16.0

FROM node:${NODE_VERSION}-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs --create-home nextjs

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS generated
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
```

Implementation note: if `prisma generate` requires a datasource value in the
container, add the same non-secret loopback build URL to the `generated` stage;
never introduce a real build secret.

- [ ] **Step 7: Confirm GREEN at the contract level**

Run:

```bash
npx vitest run src/deployment/deployment-assets.test.ts
```

Expected: PASS.

- [ ] **Step 8: Build and inspect all current runtime targets**

Run:

```bash
docker build --target app -t leafshoes/app:day10-test .
docker build --target worker -t leafshoes/worker:day10-test .
docker build --target migrate -t leafshoes/migrate:day10-test .
docker image inspect leafshoes/app:day10-test --format '{{.Config.User}} {{json .Config.Cmd}}'
docker image inspect leafshoes/worker:day10-test --format '{{.Config.User}} {{json .Config.Cmd}}'
docker image inspect leafshoes/migrate:day10-test --format '{{.Config.User}} {{json .Config.Cmd}}'
```

Expected: three builds succeed; each inspect begins with `nextjs`.

- [ ] **Step 9: Commit**

```bash
git add Dockerfile .dockerignore next.config.ts src/deployment/deployment-assets.test.ts
git commit -m "feat(deploy): add production container targets"
```

---

### Task 3: Production Compose topology and environment contract

**Files:**
- Create: `docker-compose.prod.yml`
- Create: `.env.production.example`
- Modify: `.gitignore`
- Modify: `src/deployment/deployment-assets.test.ts`

**Interfaces:**
- Consumes: Docker targets `app`, `worker`, and `migrate` from Task 2.
- Produces: Compose services `postgres`, `migrate`, `app`, `worker`, and an `ops` profile; volumes `postgres_data` and `uploads_data`.

- [ ] **Step 1: Extend the asset tests with the production topology**

Append these tests to `src/deployment/deployment-assets.test.ts`:

```ts
it("keeps the origin and database private while declaring durable volumes", async () => {
  const compose = await text("docker-compose.prod.yml");

  expect(compose).toContain('127.0.0.1:${APP_HOST_PORT:-3000}:3000');
  expect(compose).not.toMatch(/-\s*["']?\d+:5432/);
  expect(compose).toContain("postgres_data:");
  expect(compose).toContain("uploads_data:");
  expect(compose).toContain("condition: service_healthy");
  expect(compose).toContain("target: app");
  expect(compose).toContain("target: worker");
  expect(compose).toContain("target: migrate");
});

it("commits only a safe and complete production environment example", async () => {
  const env = await text(".env.production.example");

  for (const name of [
    "POSTGRES_DB",
    "POSTGRES_USER",
    "POSTGRES_PASSWORD",
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_URL",
    "APP_BASE_URL",
    "VIETQR_BANK_CODE",
    "VIETQR_ACCOUNT_NO",
    "VIETQR_ACCOUNT_NAME",
    "SEPAY_WEBHOOK_SECRET",
    "RESEND_API_KEY",
    "MAIL_FROM",
    "MAIL_REPLY_TO",
    "SMOKE_BASE_URL",
    "SMOKE_PRODUCT_PATH",
  ]) {
    expect(env).toContain(`${name}=`);
  }

  expect(env).not.toContain("0000000000");
  expect(env).not.toMatch(/re_[A-Za-z0-9]{10,}/);
});
```

- [ ] **Step 2: Confirm RED**

Run:

```bash
npx vitest run src/deployment/deployment-assets.test.ts
```

Expected: FAIL because Compose and the production env example do not exist.

- [ ] **Step 3: Allow only the safe production example in Git**

Add below the existing `.env` ignore rules in `.gitignore`:

```gitignore
!.env.production.example
```

- [ ] **Step 4: Create the production environment example**

Create `.env.production.example` with explicit non-secret sentinel values:

```dotenv
COMPOSE_PROJECT_NAME=leafshoes
RELEASE_TAG=local
APP_HOST_PORT=3000

POSTGRES_DB=leafshoes
POSTGRES_USER=leafshoes
POSTGRES_PASSWORD=replace-with-url-safe-random-password

BETTER_AUTH_SECRET=replace-with-at-least-32-random-characters
BETTER_AUTH_URL=https://leafshoesvietnam.com
APP_BASE_URL=https://leafshoesvietnam.com

UPLOAD_DIR=/data/uploads
MAX_UPLOAD_BYTES=5242880

VIETQR_BANK_CODE=replace-me
VIETQR_ACCOUNT_NO=replace-me
VIETQR_ACCOUNT_NAME=LEAFSHOES VIET NAM
VIETQR_TEMPLATE=compact2
SEPAY_WEBHOOK_SECRET=replace-with-random-webhook-secret

RESEND_API_KEY=replace-me
MAIL_FROM=onboarding@resend.dev
MAIL_REPLY_TO=leafshoesvietnam@gmail.com
# MAIL_TO_OVERRIDE=owner-of-resend-account@example.com

SMOKE_BASE_URL=https://leafshoesvietnam.com
SMOKE_PRODUCT_PATH=/products/giay-chay-bo-em-nhe

# Chỉ cần cho bootstrap có chủ đích, không dùng trong deploy thường:
# SEED_OWNER_EMAIL=replace-me
# SEED_OWNER_PASSWORD=replace-me
# SEED_STAFF_EMAIL=replace-me
# SEED_STAFF_PASSWORD=replace-me
```

- [ ] **Step 5: Create the Compose file**

Create `docker-compose.prod.yml` with:

```yaml
name: ${COMPOSE_PROJECT_NAME:-leafshoes}

x-runtime-environment: &runtime-environment
  DATABASE_URL: postgresql://${POSTGRES_USER:?required}:${POSTGRES_PASSWORD:?required}@postgres:5432/${POSTGRES_DB:?required}?schema=public
  APP_BASE_URL: ${APP_BASE_URL:?required}
  VIETQR_BANK_CODE: ${VIETQR_BANK_CODE:?required}
  VIETQR_ACCOUNT_NO: ${VIETQR_ACCOUNT_NO:?required}
  VIETQR_ACCOUNT_NAME: ${VIETQR_ACCOUNT_NAME:?required}
  VIETQR_TEMPLATE: ${VIETQR_TEMPLATE:-compact2}
  RESEND_API_KEY: ${RESEND_API_KEY:?required}
  MAIL_FROM: ${MAIL_FROM:?required}
  MAIL_REPLY_TO: ${MAIL_REPLY_TO:?required}
  MAIL_TO_OVERRIDE: ${MAIL_TO_OVERRIDE:-}

services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: ${POSTGRES_DB:?required}
      POSTGRES_USER: ${POSTGRES_USER:?required}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?required}
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 12
      start_period: 10s
    restart: unless-stopped
    volumes:
      - postgres_data:/var/lib/postgresql/data

  migrate:
    image: leafshoes/migrate:${RELEASE_TAG:-local}
    build:
      context: .
      target: migrate
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER:?required}:${POSTGRES_PASSWORD:?required}@postgres:5432/${POSTGRES_DB:?required}?schema=public
      BETTER_AUTH_SECRET: ${BETTER_AUTH_SECRET:?required}
      BETTER_AUTH_URL: ${BETTER_AUTH_URL:?required}
      SEED_OWNER_EMAIL: ${SEED_OWNER_EMAIL:-}
      SEED_OWNER_PASSWORD: ${SEED_OWNER_PASSWORD:-}
      SEED_STAFF_EMAIL: ${SEED_STAFF_EMAIL:-}
      SEED_STAFF_PASSWORD: ${SEED_STAFF_PASSWORD:-}
    depends_on:
      postgres:
        condition: service_healthy
    restart: "no"
    profiles: ["ops"]

  app:
    image: leafshoes/app:${RELEASE_TAG:-local}
    build:
      context: .
      target: app
    environment:
      <<: *runtime-environment
      BETTER_AUTH_SECRET: ${BETTER_AUTH_SECRET:?required}
      BETTER_AUTH_URL: ${BETTER_AUTH_URL:?required}
      SEPAY_WEBHOOK_SECRET: ${SEPAY_WEBHOOK_SECRET:?required}
      UPLOAD_DIR: ${UPLOAD_DIR:-/data/uploads}
      MAX_UPLOAD_BYTES: ${MAX_UPLOAD_BYTES:-5242880}
    depends_on:
      postgres:
        condition: service_healthy
    ports:
      - "127.0.0.1:${APP_HOST_PORT:-3000}:3000"
    volumes:
      - uploads_data:${UPLOAD_DIR:-/data/uploads}
    healthcheck:
      test:
        [
          "CMD",
          "node",
          "-e",
          "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))",
        ]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 20s
    init: true
    restart: unless-stopped
    stop_grace_period: 30s
    security_opt:
      - no-new-privileges:true

  worker:
    image: leafshoes/worker:${RELEASE_TAG:-local}
    build:
      context: .
      target: worker
    environment:
      <<: *runtime-environment
    depends_on:
      postgres:
        condition: service_healthy
    init: true
    restart: unless-stopped
    stop_grace_period: 30s
    security_opt:
      - no-new-privileges:true

volumes:
  postgres_data:
  uploads_data:
```

- [ ] **Step 6: Confirm GREEN and validate real Compose interpolation**

Run:

```bash
npx vitest run src/deployment/deployment-assets.test.ts
docker compose --env-file .env.production.example -f docker-compose.prod.yml config --quiet
```

Expected: tests PASS and Compose exits `0` without printing resolved secret values.

- [ ] **Step 7: Commit**

```bash
git add .gitignore .env.production.example docker-compose.prod.yml src/deployment/deployment-assets.test.ts
git commit -m "feat(deploy): define private production compose stack"
```

---

### Task 4: Safe environment validation, deployment, and backup automation

**Files:**
- Create: `scripts/validate-production-env.mjs`
- Create: `scripts/deploy-production.sh`
- Create: `scripts/backup-production.sh`
- Create: `src/deployment/production-env.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: environment names from `.env.production.example` and services from `docker-compose.prod.yml`.
- Produces: `validateProductionEnv(env): string[]`; executable deploy/backup entrypoints.

- [ ] **Step 1: Write failing validator tests**

Create `src/deployment/production-env.test.ts`:

```ts
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  REQUIRED_PRODUCTION_ENV,
  validateProductionEnv,
} from "../../scripts/validate-production-env.mjs";

describe("production environment validation", () => {
  it("returns only missing variable names in stable order", () => {
    const env = Object.fromEntries(
      REQUIRED_PRODUCTION_ENV.map((name) => [name, `${name}-value`]),
    );
    delete env.POSTGRES_PASSWORD;
    delete env.SEPAY_WEBHOOK_SECRET;

    expect(validateProductionEnv(env)).toEqual([
      "POSTGRES_PASSWORD",
      "SEPAY_WEBHOOK_SECRET",
    ]);
  });

  it("CLI never echoes present secret values when validation fails", () => {
    const secret = "must-not-appear-in-output";
    const result = spawnSync(
      process.execPath,
      ["scripts/validate-production-env.mjs"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          PATH: process.env.PATH,
          POSTGRES_PASSWORD: secret,
        },
      },
    );

    expect(result.status).toBe(1);
    expect(`${result.stdout}${result.stderr}`).not.toContain(secret);
    expect(result.stderr).toContain("POSTGRES_DB");
  });
});
```

- [ ] **Step 2: Confirm RED**

Run:

```bash
npx vitest run src/deployment/production-env.test.ts
```

Expected: FAIL because the validator does not exist.

- [ ] **Step 3: Implement the validator**

Create `scripts/validate-production-env.mjs`:

```js
import { pathToFileURL } from "node:url";

export const REQUIRED_PRODUCTION_ENV = [
  "POSTGRES_DB",
  "POSTGRES_USER",
  "POSTGRES_PASSWORD",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "APP_BASE_URL",
  "VIETQR_BANK_CODE",
  "VIETQR_ACCOUNT_NO",
  "VIETQR_ACCOUNT_NAME",
  "SEPAY_WEBHOOK_SECRET",
  "RESEND_API_KEY",
  "MAIL_FROM",
  "MAIL_REPLY_TO",
  "SMOKE_BASE_URL",
  "SMOKE_PRODUCT_PATH",
];

export function validateProductionEnv(env = process.env) {
  return REQUIRED_PRODUCTION_ENV.filter((name) => !env[name]?.trim());
}

const isDirect =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirect) {
  const missing = validateProductionEnv();
  if (missing.length > 0) {
    console.error(`Thiếu biến môi trường production: ${missing.join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log("Production environment hợp lệ.");
  }
}
```

- [ ] **Step 4: Confirm validator GREEN**

Run:

```bash
npx vitest run src/deployment/production-env.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write the deployment entrypoint**

Create executable `scripts/deploy-production.sh`:

```bash
#!/usr/bin/env bash
set -Eeuo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_dir"

compose=(docker compose -f docker-compose.prod.yml)

node scripts/validate-production-env.mjs
export RELEASE_TAG="${RELEASE_TAG:-$(git rev-parse --short=12 HEAD)}"
"${compose[@]}" config --quiet
"${compose[@]}" build app worker migrate
"${compose[@]}" up -d postgres
"${compose[@]}" run --rm migrate
"${compose[@]}" up -d --no-deps app worker

attempt=1
until curl --fail --silent --show-error \
  "http://127.0.0.1:${APP_HOST_PORT:-3000}/api/health" >/dev/null; do
  if (( attempt >= 24 )); then
    "${compose[@]}" ps
    "${compose[@]}" logs --tail=100 app worker
    exit 1
  fi
  sleep 5
  ((attempt += 1))
done
```

This sequence deliberately does not call `docker compose up` for app/worker
until the new migration container exits `0`.

- [ ] **Step 6: Write the non-destructive backup entrypoint**

Create executable `scripts/backup-production.sh`:

```bash
#!/usr/bin/env bash
set -Eeuo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_dir"

: "${BACKUP_DIR:?BACKUP_DIR must point to a host directory outside containers}"
: "${POSTGRES_DB:?required}"
: "${POSTGRES_USER:?required}"

mkdir -p "$BACKUP_DIR"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
db_file="$BACKUP_DIR/postgres-$timestamp.dump"
uploads_file="$BACKUP_DIR/uploads-$timestamp.tar.gz"
compose=(docker compose -f docker-compose.prod.yml)

"${compose[@]}" exec -T postgres \
  pg_dump --format=custom --username "$POSTGRES_USER" "$POSTGRES_DB" \
  >"$db_file"

"${compose[@]}" run --rm --no-deps \
  -v "$BACKUP_DIR:/backup" \
  --entrypoint sh app \
  -c "tar -C /data/uploads -czf /backup/$(basename "$uploads_file") ."

test -s "$db_file"
test -s "$uploads_file"
printf 'Backup created: %s\nBackup created: %s\n' "$db_file" "$uploads_file"
```

The script never removes backups and requires an explicit host destination.

- [ ] **Step 7: Add operator scripts and executable bits**

Add to `package.json` scripts:

```json
"test:smoke": "playwright test --config playwright.smoke.config.ts",
"deploy:production": "bash scripts/deploy-production.sh",
"backup:production": "bash scripts/backup-production.sh"
```

Then run:

```bash
chmod +x scripts/deploy-production.sh scripts/backup-production.sh
bash -n scripts/deploy-production.sh
bash -n scripts/backup-production.sh
```

Expected: both syntax checks exit `0`.

- [ ] **Step 8: Run focused tests and ensure scripts fail safely without env**

Run:

```bash
npx vitest run src/deployment/production-env.test.ts src/deployment/deployment-assets.test.ts
env -i PATH="$PATH" node scripts/validate-production-env.mjs
```

Expected: tests PASS; the last command exits `1`, lists missing variable names,
and prints no secret value.

- [ ] **Step 9: Commit**

```bash
git add package.json scripts/validate-production-env.mjs scripts/deploy-production.sh scripts/backup-production.sh src/deployment/production-env.test.ts
git commit -m "feat(deploy): automate safe production rollout"
```

---

### Task 5: Non-mutating remote smoke target

**Files:**
- Create: `playwright.smoke.config.ts`
- Create: `e2e/production-smoke.spec.ts`
- Modify: `Dockerfile`
- Modify: `docker-compose.prod.yml`
- Modify: `scripts/deploy-production.sh`
- Modify: `src/deployment/deployment-assets.test.ts`

**Interfaces:**
- Consumes: `SMOKE_BASE_URL` and `SMOKE_PRODUCT_PATH`; public app routes from prior days.
- Produces: Docker target/service `smoke` and `npm run test:smoke`; no browser binary is required because tests use `APIRequestContext`.

- [ ] **Step 1: Write the remote-only Playwright config**

Create `playwright.smoke.config.ts`:

```ts
import { defineConfig } from "@playwright/test";

const baseURL = process.env.SMOKE_BASE_URL;
if (!baseURL) {
  throw new Error("SMOKE_BASE_URL is required for production smoke tests");
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: "production-smoke.spec.ts",
  workers: 1,
  retries: 1,
  reporter: "line",
  use: {
    baseURL,
    extraHTTPHeaders: { "cache-control": "no-cache" },
  },
});
```

- [ ] **Step 2: Write smoke tests that fail before the deployment is available**

Create `e2e/production-smoke.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

const productPath = process.env.SMOKE_PRODUCT_PATH;
if (!productPath?.startsWith("/products/")) {
  throw new Error("SMOKE_PRODUCT_PATH must start with /products/");
}

test("production health is ready and non-cacheable", async ({ request }) => {
  const response = await request.get("/api/health");

  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(await response.json()).toEqual({ status: "ok" });
});

test("public storefront and login routes render", async ({ request }) => {
  for (const path of ["/", "/products", productPath, "/login"]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect(response.headers()["content-type"], path).toContain("text/html");
  }
});

test("anonymous admin request is redirected to login", async ({ request }) => {
  const response = await request.get("/admin", { maxRedirects: 0 });

  expect(response.status()).toBeGreaterThanOrEqual(300);
  expect(response.status()).toBeLessThan(400);
  expect(response.headers().location).toMatch(/^\/login(?:\?|$)/);
});
```

- [ ] **Step 3: Confirm the smoke config fails closed without a URL**

Run:

```bash
env -u SMOKE_BASE_URL npm run test:smoke
```

Expected: FAIL immediately with `SMOKE_BASE_URL is required`.

- [ ] **Step 4: Add the request-only smoke image**

Append to `Dockerfile`:

```dockerfile
FROM deps AS smoke
ENV NODE_ENV=test
COPY playwright.smoke.config.ts ./
COPY e2e/production-smoke.spec.ts ./e2e/production-smoke.spec.ts
USER nextjs
CMD ["npm", "run", "test:smoke"]
```

No `playwright install` command is needed because this suite uses only the
request fixture.

- [ ] **Step 5: Add the one-shot smoke service and deployment gate**

Add under `services` in `docker-compose.prod.yml`:

```yaml
  smoke:
    image: leafshoes/smoke:${RELEASE_TAG:-local}
    build:
      context: .
      target: smoke
    environment:
      SMOKE_BASE_URL: ${SMOKE_BASE_URL:?required}
      SMOKE_PRODUCT_PATH: ${SMOKE_PRODUCT_PATH:?required}
    depends_on:
      app:
        condition: service_healthy
    profiles: ["ops"]
```

Append this command after the health loop in `scripts/deploy-production.sh`:

```bash
"${compose[@]}" run --rm smoke
```

- [ ] **Step 6: Extend the deployment asset contract**

Add to the Docker/Compose target test:

```ts
expect(dockerfile).toMatch(/AS smoke\b/);
expect(dockerfile).not.toContain("playwright install");
expect(compose).toContain("target: smoke");
expect(compose).toContain("SMOKE_BASE_URL:");
expect(compose).toContain("SMOKE_PRODUCT_PATH:");
```

- [ ] **Step 7: Run smoke against the local production server**

First ensure the development database is migrated/seeded and a production
server is listening on `3000`, then run:

```bash
SMOKE_BASE_URL=http://127.0.0.1:3000 \
SMOKE_PRODUCT_PATH=/products/giay-chay-bo-em-nhe \
npm run test:smoke
```

Expected: 3 tests PASS and no browser download occurs.

- [ ] **Step 8: Build the smoke target and validate Compose**

Run:

```bash
docker build --target smoke -t leafshoes/smoke:day10-test .
docker compose --env-file .env.production.example -f docker-compose.prod.yml config --quiet
npx vitest run src/deployment/deployment-assets.test.ts
```

Expected: all commands exit `0`.

- [ ] **Step 9: Commit**

```bash
git add Dockerfile docker-compose.prod.yml scripts/deploy-production.sh playwright.smoke.config.ts e2e/production-smoke.spec.ts src/deployment/deployment-assets.test.ts
git commit -m "test(deploy): add remote production smoke gate"
```

---

### Task 6: Operator runbook and end-to-end deployment gate

**Files:**
- Create: `docs/08-production-runbook.md`
- Modify: `README.md`
- Modify if verification exposes a defect: only files from Tasks 1–5, with a focused regression test

**Interfaces:**
- Consumes: all deployment assets from Tasks 1–5 and the existing VPS/Komodo/Cloudflare Tunnel.
- Produces: an executable handoff for first launch, normal deploy, backup, restore drill, rollback, SePay/Resend acceptance, and diagnosis.

- [ ] **Step 1: Write the production runbook**

Create `docs/08-production-runbook.md` with these concrete sections:

1. **Prerequisites:** Docker/Compose, Komodo server connection, Git access,
   `cloudflared` system service, Cloudflare hostname, disk/RAM checks.
2. **Komodo Stack:** Git repository, branch `main`,
   `docker-compose.prod.yml`, project name `leafshoes`, environment copied
   from `.env.production.example`; never paste secrets into Compose source.
3. **Cloudflare origin:** public hostname
   `leafshoesvietnam.com` → `http://localhost:3000`; verify with
   `systemctl status cloudflared` and `journalctl -u cloudflared`.
4. **First launch:** fill Komodo env, run deploy action, check health, then run
   the intentional one-time bootstrap command
   `docker compose -f docker-compose.prod.yml run --rm migrate npm run db:seed`
   only after setting seed credentials and confirming production has no
   catalog data that seed would overwrite.
5. **Normal deployment:** run `scripts/deploy-production.sh`; show expected
   build, migration, app/worker health, and smoke outcome.
6. **Backup:** set an explicit `BACKUP_DIR` outside the repository/container,
   run `scripts/backup-production.sh`, verify both generated files.
7. **Restore drill:** create a separate disposable PostgreSQL container/project,
   restore the custom-format dump there with `pg_restore`, extract uploads into
   a temporary directory, verify counts/files, then remove only the explicitly
   named drill project. Never restore over production as a test.
8. **Rollback:** record current Git commit, redeploy the previous commit/tag,
   never run migration down automatically, and restore production only during
   an intentional maintenance window if schema compatibility is broken.
9. **Resend:** sandbox sender plus `MAIL_TO_OVERRIDE` before verification;
   verified `no-reply@leafshoesvietnam.com` and
   `leafshoesvietnam@gmail.com` reply-to afterward.
10. **SePay:** production webhook URL, secret, prefix `LEAF`, receiving account,
    one controlled test order/payment, idempotency verification.
11. **Manual acceptance:** VietQR, SePay `IN`, worker email, owner/staff order
    view, and upload survival after redeploy.
12. **Diagnosis:** `docker compose ps`, per-service logs, migration status,
    PostgreSQL readiness, volumes, disk, Komodo alerts, and cloudflared logs.
13. **Security checklist:** no public PostgreSQL/app origin, no Cloudflare
    `Cache Everything` rule for `/api/*` or `/admin/*`, no secrets in Git/logs.

- [ ] **Step 2: Link the runbook from README**

Add a short `Production deployment` section to `README.md` linking
`docs/08-production-runbook.md` and listing:

```bash
npm run deploy:production
npm run backup:production
npm run test:smoke
```

State that these commands require the production environment from Komodo and
must not use `.env.example` as real credentials.

- [ ] **Step 3: Run the repository verification gate**

Run:

```bash
npx prisma generate
npm run lint
npm run test
npm run build
docker compose --env-file .env.production.example -f docker-compose.prod.yml config --quiet
docker build --target app -t leafshoes/app:day10-final .
docker build --target worker -t leafshoes/worker:day10-final .
docker build --target migrate -t leafshoes/migrate:day10-final .
docker build --target smoke -t leafshoes/smoke:day10-final .
bash -n scripts/deploy-production.sh
bash -n scripts/backup-production.sh
git diff --check
```

Expected: every command exits `0`; Vitest has no failing test; no Docker build
contains real production credentials.

- [ ] **Step 4: Run an isolated Compose integration rehearsal**

Create `/tmp/leafshoes-day10-verify.env` outside Git with these exact test-only
values:

```dotenv
COMPOSE_PROJECT_NAME=leafshoes-day10-verify
RELEASE_TAG=day10-verify
APP_HOST_PORT=3300
POSTGRES_DB=leafshoes_verify
POSTGRES_USER=leafshoes_verify
POSTGRES_PASSWORD=day10-verify-url-safe-password
BETTER_AUTH_SECRET=day10-verification-only-secret-32-characters
BETTER_AUTH_URL=http://127.0.0.1:3300
APP_BASE_URL=http://127.0.0.1:3300
UPLOAD_DIR=/data/uploads
MAX_UPLOAD_BYTES=5242880
VIETQR_BANK_CODE=MB
VIETQR_ACCOUNT_NO=1111111111
VIETQR_ACCOUNT_NAME=LEAFSHOES VERIFY
VIETQR_TEMPLATE=compact2
SEPAY_WEBHOOK_SECRET=day10-verify-webhook-secret
RESEND_API_KEY=re_day10_verification_not_real
MAIL_REPLY_TO=leafshoesvietnam@gmail.com
SMOKE_BASE_URL=http://app:3000
SMOKE_PRODUCT_PATH=/products/giay-chay-bo-em-nhe
MAIL_FROM=onboarding@resend.dev
MAIL_TO_OVERRIDE=non-delivery-test@example.com
SEED_OWNER_EMAIL=owner-day10@example.com
SEED_OWNER_PASSWORD=day10-owner-password
SEED_STAFF_EMAIL=staff-day10@example.com
SEED_STAFF_PASSWORD=day10-staff-password
```

Then run:

```bash
docker compose --env-file /tmp/leafshoes-day10-verify.env -f docker-compose.prod.yml up -d postgres
docker compose --env-file /tmp/leafshoes-day10-verify.env -f docker-compose.prod.yml run --rm migrate
docker compose --env-file /tmp/leafshoes-day10-verify.env -f docker-compose.prod.yml run --rm migrate npm run db:seed
docker compose --env-file /tmp/leafshoes-day10-verify.env -f docker-compose.prod.yml up -d app worker
curl --fail http://127.0.0.1:3300/api/health
docker compose --env-file /tmp/leafshoes-day10-verify.env -f docker-compose.prod.yml run --rm smoke
docker compose --env-file /tmp/leafshoes-day10-verify.env -f docker-compose.prod.yml ps
```

Expected: PostgreSQL healthy, migration exits `0`, app healthy, worker remains
running, health returns `{"status":"ok"}`, and all smoke tests pass.

After recording evidence, remove only the explicitly named rehearsal project:

```bash
docker compose --env-file /tmp/leafshoes-day10-verify.env -f docker-compose.prod.yml down --volumes
```

Expected: only project `leafshoes-day10-verify` containers/network/volumes are
removed; production project `leafshoes` is untouched.

- [ ] **Step 5: Run existing browser E2E and inspect the final diff**

Run:

```bash
npm run db:seed
npm run test:e2e
git status --short
git diff --check
```

Expected: existing E2E passes; only intended Day 10 files are changed.

- [ ] **Step 6: Commit**

```bash
git add README.md docs/08-production-runbook.md
git commit -m "docs: add production operations runbook"
```

- [ ] **Step 7: Final evidence**

Record in the implementation handoff:

- exact test/build counts and exit codes;
- four Docker target build results;
- Compose rehearsal health/smoke result;
- any external actions still requiring the operator: Komodo secrets, Tunnel
  hostname, Resend domain verification, SePay production webhook, and the
  controlled real-payment/email acceptance.
