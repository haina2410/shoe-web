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
db_tmp=
uploads_tmp=
db_published=0
uploads_published=0
pair_published=0

if ! mkdir "$lock_dir" 2>/dev/null; then
  printf 'Backup timestamp is already in use: %s\n' "$timestamp" >&2
  exit 1
fi

cleanup() {
  local status=$?
  trap - EXIT
  if [[ -n "$db_tmp" ]]; then
    rm -f -- "$db_tmp" || true
  fi
  if [[ -n "$uploads_tmp" ]]; then
    rm -f -- "$uploads_tmp" || true
  fi
  if (( pair_published == 0 )); then
    if (( uploads_published == 1 )); then
      rm -f -- "$uploads_file" || true
    fi
    if (( db_published == 1 )); then
      rm -f -- "$db_file" || true
    fi
  fi
  rmdir "$lock_dir" 2>/dev/null || true
  exit "$status"
}
trap cleanup EXIT

if [[ -e "$db_file" || -e "$uploads_file" ]]; then
  printf 'Backup destination already exists for timestamp: %s\n' \
    "$timestamp" >&2
  exit 1
fi

db_tmp="$(mktemp "$BACKUP_DIR/.postgres-$timestamp.XXXXXX")"
uploads_tmp="$(mktemp "$BACKUP_DIR/.uploads-$timestamp.XXXXXX")"

"${compose[@]}" exec -T postgres \
  pg_dump --format=custom --username "$POSTGRES_USER" "$POSTGRES_DB" \
  >"$db_tmp"

"${compose[@]}" run --rm --no-deps --entrypoint tar app \
  -C /data/uploads -czf - . >"$uploads_tmp"

test -s "$db_tmp"
test -s "$uploads_tmp"
mv -- "$db_tmp" "$db_file"
db_published=1
db_tmp=
mv -- "$uploads_tmp" "$uploads_file"
uploads_published=1
uploads_tmp=
pair_published=1
printf 'Backup created: %s\nBackup created: %s\n' "$db_file" "$uploads_file"
