#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_dir"

: "${BACKUP_DIR:?BACKUP_DIR must point to a host directory outside containers}"
: "${POSTGRES_DB:?required}"
: "${POSTGRES_USER:?required}"

mkdir -p "$BACKUP_DIR"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
db_file="$BACKUP_DIR/postgres-$timestamp.dump"
uploads_file="$BACKUP_DIR/uploads-$timestamp.tar.gz"
lock_dir="$BACKUP_DIR/.leafshoes-backup-$timestamp.lock"
compose=(docker compose -f docker-compose.prod.yml)

if ! mkdir "$lock_dir" 2>/dev/null; then
  printf 'Backup timestamp is already in use: %s\n' "$timestamp" >&2
  exit 1
fi
trap 'rmdir "$lock_dir"' EXIT

if [[ -e "$db_file" || -e "$uploads_file" ]]; then
  printf 'Backup destination already exists for timestamp: %s\n' \
    "$timestamp" >&2
  exit 1
fi

"${compose[@]}" exec -T postgres \
  pg_dump --format=custom --username "$POSTGRES_USER" "$POSTGRES_DB" \
  >"$db_file"

"${compose[@]}" run --rm --no-deps --entrypoint tar app \
  -C /data/uploads -czf - . >"$uploads_file"

test -s "$db_file"
test -s "$uploads_file"
printf 'Backup created: %s\nBackup created: %s\n' "$db_file" "$uploads_file"
