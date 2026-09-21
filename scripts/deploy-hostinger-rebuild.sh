#!/usr/bin/env bash
# Hostinger prod : construire les images pendant que le site tourne,
# puis basculer avec l’overlay + profil antivirus. Un build raté laisse
# l’ancienne stack en ligne. Ne pas toucher à kodiva / sdcreativ.
set -euo pipefail

APP_DIR="${HOSTINGER_APP_DIR:-${APP_DIR:-/var/www/caddynote}}"
HEALTH_URL="${HOSTINGER_HEALTH_URL:-http://127.0.0.1:14000/health}"
cd "$APP_DIR"

compose() {
  docker compose \
    -f docker-compose.yml \
    -f docker-compose.hostinger.yml \
    --profile antivirus \
    "$@"
}

if [[ "${DEPLOY_GIT_RESET:-0}" == "1" ]]; then
  echo "Deploying in $APP_DIR @ $(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
  git fetch origin main
  git reset --hard origin/main
  echo "Now at $(git rev-parse --short HEAD)"
fi

# Fantômes arrêtés seulement — jamais un conteneur Up.
for name in caddynote-api caddynote-web caddynote-worker; do
  docker ps -aq --filter "name=${name}" --filter "status=exited" | xargs -r docker rm || true
  docker ps -aq --filter "name=${name}" --filter "status=created" | xargs -r docker rm || true
  docker ps -aq --filter "name=${name}" --filter "status=dead" | xargs -r docker rm || true
done

echo "Building API (site still serving)…"
compose build caddynote-api
echo "Building web (site still serving)…"
compose build caddynote-web

echo "Switching containers to new images (overlay + ClamAV)…"
compose up -d --no-build --remove-orphans

echo "Waiting for API health at $HEALTH_URL …"
ok=0
for i in $(seq 1 36); do
  if curl -fsS --connect-timeout 2 --max-time 5 "$HEALTH_URL" >/tmp/caddynote-health.json 2>/dev/null; then
    ok=1
    break
  fi
  echo "  attempt $i/36 — not ready yet"
  sleep 5
done
if [[ "$ok" != 1 ]]; then
  echo "::error::API health check failed after ~3 min" >&2
  compose ps || true
  compose logs --tail=120 caddynote-api || true
  exit 1
fi
cat /tmp/caddynote-health.json
echo
compose exec -T caddynote-api npx prisma migrate deploy
compose ps
