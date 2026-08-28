#!/usr/bin/env bash
# Push nocturne sécurisé de `main` vers origin (option A).
# - Ne committe jamais.
# - Ne pousse que si : branche main, working tree propre, commits en avance sur origin/main.
# - Après push : attend le workflow « CI CaddyNote » et notifie succès / échec du déploiement.
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
WORKFLOW_NAME="CI CaddyNote"
LOG_DIR="${HOME}/Library/Logs"
LOG_FILE="${LOG_DIR}/caddynote-nightly-push.log"
LOCK_FILE="${TMPDIR:-/tmp}/caddynote-nightly-push.lock"
TOKEN_FILE="${HOME}/.config/caddynote/github_token"
# CI + build Docker self-hosted : marge large.
CI_POLL_SECONDS="${CADDYNOTE_CI_POLL_SECONDS:-30}"
CI_MAX_WAIT_SECONDS="${CADDYNOTE_CI_MAX_WAIT_SECONDS:-5400}"

# launchd a un PATH minimal — inclure Homebrew pour `gh` éventuel.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

mkdir -p "${LOG_DIR}"

log() {
  local line="[$(date '+%Y-%m-%d %H:%M:%S %z')] $*"
  printf '%s\n' "${line}" | tee -a "${LOG_FILE}"
}

notify() {
  local title="$1"
  local body="$2"
  if command -v osascript >/dev/null 2>&1; then
    local title_q body_q
    title_q=$(printf '%s' "${title}" | /usr/bin/python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')
    body_q=$(printf '%s' "${body}" | /usr/bin/python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')
    /usr/bin/osascript -e "display notification ${body_q} with title ${title_q}" 2>/dev/null || true
  fi
}

github_owner_repo() {
  local url
  url="$(git remote get-url "${REMOTE}" 2>/dev/null || true)"
  if [[ "${url}" =~ github\.com[:/]([^/]+)/([^/.]+)(\.git)?$ ]]; then
    printf '%s/%s' "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}"
    return 0
  fi
  return 1
}

github_token() {
  if [[ -n "${GH_TOKEN:-}" ]]; then
    printf '%s' "${GH_TOKEN}"
    return 0
  fi
  if [[ -n "${GITHUB_TOKEN:-}" ]]; then
    printf '%s' "${GITHUB_TOKEN}"
    return 0
  fi
  if [[ -f "${TOKEN_FILE}" ]]; then
    tr -d '\r\n' < "${TOKEN_FILE}"
    return 0
  fi
  return 1
}

# Attend le run Actions pour un SHA et notifie le résultat.
wait_for_ci_and_notify() {
  local sha="$1"
  local short
  short="$(printf '%s' "${sha}" | cut -c1-7)"
  local repo
  if ! repo="$(github_owner_repo)"; then
    log "WARN impossible de résoudre owner/repo — suivi CI ignoré"
    notify "CaddyNote déploiement" "Push OK (${short}) — suivi CI indisponible (remote)"
    return 0
  fi

  local token=""
  token="$(github_token 2>/dev/null || true)"
  if [[ -z "${token}" ]] && ! command -v gh >/dev/null 2>&1; then
    log "WARN ni gh ni jeton GitHub — créez ${TOKEN_FILE} (PAT actions:read) ou installez gh"
    notify "CaddyNote déploiement" "Push OK (${short}) — configurez un jeton pour le suivi CI"
    return 0
  fi

  log "Suivi CI « ${WORKFLOW_NAME} » pour ${short} (max ${CI_MAX_WAIT_SECONDS}s)…"
  notify "CaddyNote déploiement" "Push OK — suivi du déploiement staging…"

  local elapsed=0
  local run_id=""
  local conclusion=""
  local html_url=""

  while [[ "${elapsed}" -le "${CI_MAX_WAIT_SECONDS}" ]]; do
    local json=""
    if [[ -n "${token}" ]]; then
      json="$(
        curl -fsS \
          -H "Accept: application/vnd.github+json" \
          -H "Authorization: Bearer ${token}" \
          -H "X-GitHub-Api-Version: 2022-11-28" \
          "https://api.github.com/repos/${repo}/actions/runs?branch=${BRANCH}&per_page=15" \
          2>>"${LOG_FILE}" || true
      )"
    elif command -v gh >/dev/null 2>&1; then
      json="$(
        gh api "repos/${repo}/actions/runs?branch=${BRANCH}&per_page=15" 2>>"${LOG_FILE}" || true
      )"
    fi

    if [[ -n "${json}" ]]; then
      # shellcheck disable=SC2016
      local parsed
      parsed="$(
        printf '%s' "${json}" | HEAD_SHA="${sha}" /usr/bin/python3 -c '
import json, os, sys
sha = os.environ.get("HEAD_SHA", "")
try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)
for run in data.get("workflow_runs") or []:
    if run.get("head_sha") != sha:
        continue
    name = run.get("name") or ""
    path = run.get("path") or ""
    if name != "CI CaddyNote" and "ci.yml" not in path:
        continue
    print(run.get("id") or "")
    print(run.get("status") or "")
    print(run.get("conclusion") or "")
    print(run.get("html_url") or "")
    break
'
      )"
      if [[ -n "${parsed}" ]]; then
        run_id="$(printf '%s\n' "${parsed}" | sed -n '1p')"
        local status
        status="$(printf '%s\n' "${parsed}" | sed -n '2p')"
        conclusion="$(printf '%s\n' "${parsed}" | sed -n '3p')"
        html_url="$(printf '%s\n' "${parsed}" | sed -n '4p')"
        log "CI run=${run_id} status=${status} conclusion=${conclusion:-…}"
        if [[ "${status}" == "completed" ]]; then
          break
        fi
      else
        log "CI : run pour ${short} pas encore listé…"
      fi
    else
      log "CI : requête API vide / erreur (voir log)"
    fi

    sleep "${CI_POLL_SECONDS}"
    elapsed=$((elapsed + CI_POLL_SECONDS))
  done

  if [[ -z "${run_id}" || "${conclusion}" == "" ]]; then
    log "ERROR timeout ou run introuvable pour ${short}"
    notify "CaddyNote déploiement" "Échec suivi : timeout CI (${short})"
    return 1
  fi

  case "${conclusion}" in
    success)
      log "OK déploiement / CI réussi (${short}) ${html_url}"
      notify "CaddyNote déploiement" "Réussi — staging à jour (${short})"
      return 0
      ;;
    *)
      log "ERROR CI conclusion=${conclusion} (${short}) ${html_url}"
      notify "CaddyNote déploiement" "Échoué (${conclusion}) — ${short}"
      return 1
      ;;
  esac
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

push_sha="$(git rev-parse HEAD)"
if git push "${REMOTE}" "${BRANCH}" 2>&1 | tee -a "${LOG_FILE}"; then
  log "OK push réussi (${ahead} commit(s)) sha=${push_sha}"
  notify "CaddyNote nightly-push" "Push OK — ${ahead} commit(s) → GitHub"
  # Ne laisse pas un échec CI faire échouer le code de sortie du push lui-même
  # pour launchd : on logge + notifie, exit 1 seulement si CI a échoué.
  if wait_for_ci_and_notify "${push_sha}"; then
    exit 0
  fi
  exit 1
fi

log "ERROR git push a échoué"
notify "CaddyNote nightly-push" "Échec : git push"
exit 1
