#!/usr/bin/env bash
# Installe / met à jour le LaunchAgent de push nocturne CaddyNote.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
LABEL="com.sdcreativ.caddynote.nightly-push"
SRC_PLIST="${SCRIPT_DIR}/${LABEL}.plist"
DEST_DIR="${HOME}/Library/LaunchAgents"
DEST_PLIST="${DEST_DIR}/${LABEL}.plist"
PUSH_SCRIPT="${REPO_DIR}/scripts/nightly-push-main.sh"

if [[ ! -f "${SRC_PLIST}" ]]; then
  echo "Plist introuvable : ${SRC_PLIST}" >&2
  exit 1
fi
if [[ ! -x "${PUSH_SCRIPT}" ]]; then
  chmod +x "${PUSH_SCRIPT}"
fi

mkdir -p "${DEST_DIR}"
# Réécrit le chemin absolu du dépôt dans la copie installée (au cas où le clone bouge).
sed \
  -e "s|/Users/user/Sites/localhost/scolartrack|${REPO_DIR}|g" \
  -e "s|/Users/user/Library/Logs|${HOME}/Library/Logs|g" \
  "${SRC_PLIST}" > "${DEST_PLIST}"

launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "${DEST_PLIST}"
launchctl enable "gui/$(id -u)/${LABEL}" 2>/dev/null || true

echo "Installé : ${DEST_PLIST}"
echo "Horaire  : tous les jours à 03:00 (heure locale)"
echo "Logs     : ~/Library/Logs/caddynote-nightly-push.log"
echo
echo "Test immédiat (simulation) :"
echo "  ${PUSH_SCRIPT} --dry-run"
echo
echo "Désinstaller :"
echo "  launchctl bootout gui/$(id -u)/${LABEL}"
echo "  rm -f ${DEST_PLIST}"
