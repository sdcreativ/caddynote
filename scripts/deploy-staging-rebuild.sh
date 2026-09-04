#!/usr/bin/env bash
# Staging Oracle : construire les images pendant que le site tourne,
# puis basculer. Un build raté laisse l’ancienne stack en ligne.
set -euo pipefail

APP_DIR="${STAGING_APP_DIR:-${APP_DIR:-/home/ubuntu/caddynote}}"
cd "$APP_DIR"

if [[ "${DEPLOY_GIT_RESET:-0}" == "1" ]]; then
  echo "Deploying in $APP_DIR @ $(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
  git fetch origin main
  git reset --hard origin/main
  echo "Now at $(git rev-parse --short HEAD)"
fi

# Fantômes arrêtés seulement — jamais un conteneur Up (évite ERR_CONNECTION_REFUSED).
for name in caddynote-api caddynote-web caddynote-worker; do
  docker ps -aq --filter "name=${name}" --filter "status=exited" | xargs -r docker rm || true
  docker ps -aq --filter "name=${name}" --filter "status=created" | xargs -r docker rm || true
  docker ps -aq --filter "name=${name}" --filter "status=dead" | xargs -r docker rm || true
done

echo "Building API (site still serving)…"
docker compose build caddynote-api
echo "Building web (site still serving)…"
docker compose build caddynote-web

echo "Switching containers to new images…"
docker compose up -d --no-build --remove-orphans caddynote-db caddynote-api caddynote-web

echo "Waiting for API health…"
ok=0
for i in $(seq 1 36); do
  if curl -fsS --connect-timeout 2 --max-time 5 http://127.0.0.1:4000/health >/tmp/caddynote-health.json 2>/dev/null; then
    ok=1
    break
  fi
  echo "  attempt $i/36 — not ready yet"
  sleep 5
done
if [[ "$ok" != 1 ]]; then
  echo "::error::API health check failed after ~3 min" >&2
  docker compose ps || true
  docker compose logs --tail=120 caddynote-api || true
  exit 1
fi
cat /tmp/caddynote-health.json
echo
docker compose exec -T caddynote-api npx prisma migrate deploy
docker compose ps
