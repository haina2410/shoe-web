#!/usr/bin/env bash
set -Eeuo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_dir"

compose=(docker compose -f docker-compose.prod.yml)

node scripts/validate-production-env.mjs
export RELEASE_TAG="${RELEASE_TAG:-$(git rev-parse --short=12 HEAD)}"
"${compose[@]}" config --quiet
"${compose[@]}" build app worker migrate smoke
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

"${compose[@]}" run --rm smoke
