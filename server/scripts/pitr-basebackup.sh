#!/usr/bin/env bash
# Base backup Postgres pour PITR staging (complément des WAL).
# Usage (hôte, Postgres client installé, ou via docker exec) :
#   ./server/scripts/pitr-basebackup.sh
#
# Env :
#   PITR_BASEBACKUP_PATH  défaut : ./tmp/pg_basebackups (relatif racine dépôt)
#   DATABASE_URL          ou POSTGRES_* compose
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${PITR_BASEBACKUP_PATH:-$ROOT/tmp/pg_basebackups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="$OUT/base-$STAMP"

if [[ "${CADDYNOTE_DEPLOYMENT:-}" == "production" ]]; then
  echo "Refus : CADDYNOTE_DEPLOYMENT=production" >&2
  exit 1
fi

mkdir -p "$OUT"

# Préférer docker exec si le service tourne (évite droits bind depuis l'hôte).
if docker compose -f "$ROOT/docker-compose.yml" ps --status running caddynote-db 2>/dev/null | grep -q caddynote-db; then
  echo "Basebackup via docker exec → /var/lib/postgresql/basebackups/base-$STAMP"
  docker compose -f "$ROOT/docker-compose.yml" -f "$ROOT/docker-compose.pitr.yml" exec -T caddynote-db \
    bash -c "mkdir -p /var/lib/postgresql/basebackups && pg_basebackup -U \"\$POSTGRES_USER\" -D \"/var/lib/postgresql/basebackups/base-$STAMP\" -Ft -z -P -c fast"
  echo "OK : $DEST (dans le bind mount PITR)"
  exit 0
fi

URL="${DATABASE_URL:-postgresql://caddynote:caddynote@127.0.0.1:5433/caddynote}"
echo "Basebackup via pg_basebackup hôte → $DEST"
mkdir -p "$DEST"
pg_basebackup -d "$URL" -D "$DEST" -Ft -z -P -c fast
echo "OK : $DEST"
