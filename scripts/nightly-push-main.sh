#!/usr/bin/env bash
# Push nocturne sécurisé de `main` vers origin (option A).
# - Ne committe jamais.
# - Ne pousse que si : branche main, working tree propre, commits en avance sur origin/main.
# Usage :
#   ./scripts/nightly-push-main.sh           # push réel si conditions OK
#   ./scripts/nightly-push-main.sh --dry-run # simulation

set -euo pipefail

DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BRANCH="main"
REMOTE="origin"
LOG_DIR="${HOME}/Library/Logs"
LOG_FILE="${LOG_DIR}/caddynote-nightly-push.log"
LOCK_FILE="${TMPDIR:-/tmp}/caddynote-nightly-push.lock"

mkdir -p "${LOG_DIR}"

log() {
  local line="[$(date '+%Y-%m-%d %H:%M:%S %z')] $*"
  printf '%s\n' "${line}" | tee -a "${LOG_FILE}"
}

notify() {
  local title="$1"
  local body="$2"
  if command -v osascript >/dev/null 2>&1; then
    osascript -e "display notification \"${body}\" with title \"${title}\"" 2>/dev/null || true
  fi
}

# Évite deux exécutions simultanées (réveil + horaire).
if command -v shlock >/dev/null 2>&1; then
  if ! shlock -f "${LOCK_FILE}" -p $$; then
    log "SKIP déjà en cours (lock ${LOCK_FILE})"
    exit 0
  fi
  trap 'rm -f "${LOCK_FILE}"' EXIT
fi

cd "${REPO_DIR}"

log "=== nightly-push démarré (${REPO_DIR}) dry_run=${DRY_RUN} ==="

# launchd démarre souvent avec un agent SSH vide : charge la clé GitHub du Keychain.
ensure_ssh_ready() {
  if ! command -v ssh-add >/dev/null 2>&1; then
    return 0
  fi
  if ssh-add -l >/dev/null 2>&1; then
    return 0
  fi
  local key="${HOME}/.ssh/id_github_sdcreativ"
  if [[ -f "${key}" ]]; then
    ssh-add --apple-use-keychain "${key}" 2>>"${LOG_FILE}" \
      || ssh-add "${key}" 2>>"${LOG_FILE}" \
      || true
  fi
  ssh-add --apple-load-keychain 2>>"${LOG_FILE}" || true
}

ensure_ssh_ready

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  log "ERROR pas un dépôt git"
  notify "CaddyNote nightly-push" "Échec : pas un dépôt git"
  exit 1
fi

current_branch="$(git branch --show-current || true)"
if [[ "${current_branch}" != "${BRANCH}" ]]; then
  log "SKIP branche=${current_branch:-detached} (attendu ${BRANCH})"
  notify "CaddyNote nightly-push" "Ignoré : branche ${current_branch:-detached}"
  exit 0
fi

if [[ -n "$(git status --porcelain)" ]]; then
  log "SKIP working tree sale — committez avant le push auto"
  git status --porcelain | tee -a "${LOG_FILE}"
  notify "CaddyNote nightly-push" "Ignoré : fichiers non commités"
  exit 0
fi

log "Fetch ${REMOTE}…"
if ! git fetch "${REMOTE}" "${BRANCH}" 2>&1 | tee -a "${LOG_FILE}"; then
  log "ERROR git fetch a échoué"
  notify "CaddyNote nightly-push" "Échec : git fetch"
  exit 1
fi

if ! git rev-parse --verify "${REMOTE}/${BRANCH}" >/dev/null 2>&1; then
  log "ERROR ${REMOTE}/${BRANCH} introuvable"
  notify "CaddyNote nightly-push" "Échec : remote/branch manquant"
  exit 1
fi

ahead="$(git rev-list --count "${REMOTE}/${BRANCH}..HEAD")"
behind="$(git rev-list --count "HEAD..${REMOTE}/${BRANCH}")"

log "ahead=${ahead} behind=${behind} HEAD=$(git rev-parse --short HEAD) remote=$(git rev-parse --short "${REMOTE}/${BRANCH}")"

if [[ "${behind}" -gt 0 ]]; then
  log "SKIP divergé / en retard sur ${REMOTE}/${BRANCH} (behind=${behind}) — rebase/merge manuel requis"
  notify "CaddyNote nightly-push" "Ignoré : main locale en retard sur origin"
  exit 0
fi

if [[ "${ahead}" -eq 0 ]]; then
  log "OK rien à pousser"
  exit 0
fi

log "Push de ${ahead} commit(s) vers ${REMOTE}/${BRANCH}…"
if [[ "${DRY_RUN}" -eq 1 ]]; then
  log "DRY-RUN : git push ${REMOTE} ${BRANCH} (non exécuté)"
  notify "CaddyNote nightly-push" "Dry-run : ${ahead} commit(s) prêts"
  exit 0
fi

if git push "${REMOTE}" "${BRANCH}" 2>&1 | tee -a "${LOG_FILE}"; then
  log "OK push réussi (${ahead} commit(s))"
  notify "CaddyNote nightly-push" "Push OK — ${ahead} commit(s) → staging"
  exit 0
fi

log "ERROR git push a échoué"
notify "CaddyNote nightly-push" "Échec : git push"
exit 1
