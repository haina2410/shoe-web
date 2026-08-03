#!/usr/bin/env sh
set -eu

./node_modules/.bin/prisma migrate deploy

if [ "${SEED:-0}" != "1" ]; then
  exit 0
fi

# `--only-if-empty`: service này chạy ở mọi `compose up`, nên SEED=1 sót lại
# trong environment không được phép ghi đè shop đang bán.
echo "[migrate] SEED=1 → bootstrap dữ liệu nếu database còn trắng"
exec ./node_modules/.bin/tsx prisma/seed.ts --only-if-empty
