#!/usr/bin/env bash
set -Eeuo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_dir"

build_locally="${BUILD_LOCALLY:-0}"
compose=(docker compose -f docker-compose.prod.yml)
if [[ "$build_locally" == "1" ]]; then
  compose+=(-f docker-compose.build.yml)
fi

node scripts/validate-production-env.mjs
export RELEASE_TAG="${RELEASE_TAG:-$(git rev-parse --short=12 HEAD)}"
"${compose[@]}" config --quiet

# Pull (hoặc build) trước khi động vào bất cứ container nào đang chạy: thiếu
# image thì deploy phải dừng lúc app/worker cũ còn nguyên.
if [[ "$build_locally" == "1" ]]; then
  "${compose[@]}" build app worker migrate smoke
elif ! "${compose[@]}" pull --policy always app worker migrate smoke; then
  cat >&2 <<EOF
Không pull được image cho RELEASE_TAG=$RELEASE_TAG. Kiểm tra theo thứ tự:
  1. Workflow 'Publish images' cho commit này chạy xong chưa?
  2. Package đã chuyển sang private chưa? Nếu rồi, host cần
     'docker login ghcr.io' bằng token có read:packages.
  3. Registry không tới được mà vẫn phải deploy:
     BUILD_LOCALLY=1 npm run deploy:production
EOF
  exit 1
fi

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
