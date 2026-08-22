#!/bin/sh
# Démarre l'API seulement après application des migrations Prisma.
# Sans ça, un `docker compose up` sur un volume Postgres neuf laisserait
# l'API parler à une base vide (tables absentes) — 500 partout, pas un
# schéma à jour. `migrate deploy` est idempotent (no-op si déjà à jour).
#
# Le process `worker` ne migre pas : deux `migrate deploy` concurrents
# (API + worker au boot) se marcheraient dessus. Le worker attend l'API
# healthy (voir docker-compose.yml, profil `split`).
set -eu
role="${CADDYNOTE_PROCESS_ROLE:-all}"
if [ "$role" != "worker" ]; then
  echo "Prisma migrate deploy…"
  npx prisma migrate deploy
else
  echo "Rôle worker — migrations laissées à l'API."
fi
echo "Démarrage (rôle=${role})…"
exec node dist/index.js
