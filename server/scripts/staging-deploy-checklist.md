# Checklist préproduction (staging) — gratuit / VPS

Objectif : exposer CaddyNote sur une VM (Oracle Always Free, OVH, Hetzner…) et déployer automatiquement au push `main`.

**Mode recommandé (Oracle A1 / ARM64)** : self-hosted runner → `git pull` + `docker compose up --build`  
(détail : [`oracle-cloud-always-free.md`](./oracle-cloud-always-free.md) §8).

**Mode optionnel** : Docker Hub + SSH ([`deploy-staging.yml`](../../.github/workflows/deploy-staging.yml), `workflow_dispatch`).

Ne jamais committer `server/.env`, `.env`, ni clés SSH / deploy keys privées.

---

## 0. Prérequis

- [ ] VM Linux (Ubuntu 22.04+) avec IP publique — Oracle A1 = **ARM64**
- [ ] Accès SSH par clé
- [ ] Ports : Security List **et** iptables locaux → `22`, `8080`, `4000` (puis `80`/`443` si HTTPS)
- [ ] Repo GitHub avec Actions activées
- [ ] Self-hosted : runner Linux ARM64 + label `staging` (pas besoin de Docker Hub)

---

## 1. Préparer la VM (self-hosted)

```bash
# Sous ubuntu (pas root)
sudo usermod -aG docker ubuntu   # puis reconnecte-toi
mkdir -p ~/caddynote && cd ~/caddynote
git clone git@github.com:sdcreativ/caddynote.git .
# .env racine + server/.env (secrets staging) — jamais commités
```

Fichiers indispensables :

- `docker-compose.yml`
- `.env` (ports, `VITE_API_URL`, `CORS_ORIGIN`, Postgres)
- `server/.env` (JWT, bootstrap, `CADDYNOTE_DEPLOYMENT=staging`, …)

ClamAV : **désactivé** par défaut (pas d’image ARM64). Profil `antivirus` = x86 uniquement.

Voir aussi §8 de `oracle-cloud-always-free.md` (déplacer depuis `/root`, deploy key, runner systemd, iptables).

---

## 2. `server/.env` staging (minimal)

Sur la VM uniquement. Valeurs **fictives** ci-dessous — génère les vrais secrets.

```env
CADDYNOTE_DEPLOYMENT=staging
CADDYNOTE_TEST_MODE=false
CADDYNOTE_PROCESS_ROLE=all

JWT_SECRET=<openssl rand -hex 32>
JWT_EXPIRES_IN=12h

# Obligatoire en staging (sinon l’API refuse de démarrer)
FILE_ENCRYPTION_KEY=<openssl rand -hex 32>

APP_URL=http://IP_PUBLIQUE:8080
API_URL=http://IP_PUBLIQUE:4000
CORS_ORIGIN=http://IP_PUBLIQUE:8080

BOOTSTRAP_ADMIN_EMAIL=toi@exemple.ci
BOOTSTRAP_ADMIN_PASSWORD=<openssl rand -base64 24>

# Optionnel sur Oracle ARM (pas d’image ClamAV ARM64 officielle).
# Obligatoire uniquement en production (x86 + profile antivirus).
CLAMAV_HOST=
```

`.env` racine (extrait) :

```env
VITE_API_URL=http://IP_PUBLIQUE:4000
VITE_SITE_URL=http://IP_PUBLIQUE:8080
CORS_ORIGIN=http://IP_PUBLIQUE:8080
POSTGRES_PASSWORD=<secret fort URL-safe>
```

**Interdit en staging :** `CADDYNOTE_TEST_MODE=true`, `ALLOW_PRIVILEGED_REGISTER`, mots de passe démo.

---

## 3. Premier démarrage manuel (avant CI)

```bash
cd ~/caddynote
docker compose up -d --build caddynote-db caddynote-api caddynote-web
docker compose exec -T caddynote-api npx prisma migrate deploy
curl -sS http://127.0.0.1:4000/health
```

Mode split api/worker (optionnel, overlay) :

```bash
docker compose -f docker-compose.yml -f docker-compose.staging.yml --profile split \
  up -d --build caddynote-db caddynote-api caddynote-worker caddynote-web
```

**Build web :** `VITE_API_URL` doit être l’URL publique de l’API au moment du `docker compose build`.

---

## 4. Déploiement auto (self-hosted)

Job CI : `deploy_staging_self_hosted` dans [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)

- Déclenché : push `main` après tests verts
- Runner labels : `self-hosted`, `linux`, `ARM64`, `staging`
- Actions : `git fetch` + `reset --hard origin/main` → `compose up --build` → attendre `/health` (retries) → migrate → `docker compose ps`
- Variable optionnelle : `STAGING_APP_DIR` (défaut `/home/ubuntu/caddynote`)

Checklist runner :

- [ ] App sous `/home/ubuntu/caddynote`
- [ ] Deploy key read-only + `git remote` SSH
- [ ] Runner installé en service (`svc.sh`) sous `ubuntu`
- [ ] Label `staging` présent
- [ ] `ubuntu` dans le groupe `docker`

---

## 5. Mode optionnel — Docker Hub + SSH

Secrets GitHub (Settings → Secrets and variables → Actions) :

| Secret | Exemple / rôle |
|--------|----------------|
| `DOCKER_USERNAME` | Compte Docker Hub |
| `DOCKER_PASSWORD` | Token Docker Hub |
| `STAGING_HOST` | IP ou hostname de la VM |
| `STAGING_USER` | Ex. `ubuntu` |
| `STAGING_SSH_KEY` | Clé privée SSH |
| `STAGING_APP_DIR` | Ex. `/home/ubuntu/caddynote` |
| `STAGING_API_URL` | Ex. `http://IP:4000` |
| `STAGING_SMOKE_EMAIL` | Compte smoke |
| `STAGING_SMOKE_PASSWORD` | Mot de passe smoke |

Sur A1 ARM : build multi-arch `linux/arm64` obligatoire (sinon images amd64 inutilisables).  
Workflow : **Deploy staging** (`workflow_dispatch`).

---

## 6. Après le premier boot

1. Ouvrir le front → login bootstrap  
2. Activer MFA admin  
3. Créer un établissement + un `school_admin`  
4. Retirer `BOOTSTRAP_ADMIN_*` du `.env` staging → restart API  
5. `POST /admin/bootstrap/retire`  
6. (Optionnel) `STAGING_SMOKE_*` pour smoke CI Docker Hub  

---

## 7. Contrôles smoke

```bash
curl -sS "http://IP_PUBLIQUE:4000/health"
```

- [ ] Login super-admin  
- [ ] Création établissement  
- [ ] Pas d’erreur CORS dans la console navigateur  

---

## 8. Coûts & pièges

| Piège | Mitigation |
|-------|------------|
| Front toujours sur `localhost:4000` | Rebuild web avec `VITE_API_URL` public |
| CORS bloqué | `CORS_ORIGIN` = origine exacte du front |
| Timeout navigateur | Security List **et** iptables INPUT 8080/4000 |
| Job deploy en file d’attente | Runner offline / label `staging` manquant |
| ClamAV pull fail ARM | Ne pas activer le profil `antivirus` (optionnel en staging) |
| API refuse de démarrer | `FILE_ENCRYPTION_KEY` manquante/invalide en staging |
| Disque VM plein | `docker system prune` périodique |
| Postgres exposé | Ne **pas** publier 5433 sur Internet |

---

## 8b. Suivant — HTTPS / domaine (hors scope code actuel)

Chantier ops séparé après durcissement chiffrement / antivirus / JWT :

- [ ] Domaine + Caddy (ou équivalent) + Let’s Encrypt
- [ ] `APP_URL` / `API_URL` / `CORS_ORIGIN` / `VITE_*` en `https://…`
- [ ] Security List + iptables `80`/`443` ; retirer l’exposition HTTP nu `8080`/`4000` si possible

---

## 9. Grille financière (Lots 1–5) — sur autorisation seulement

Ne pas exécuter `migrate deploy` staging sans go explicite.

Avant migrate :

- [x] Backup DB staging
- [x] Vérifier migrations `20260823100*` présentes dans l’image / le checkout
- [x] Feature flag `finance` (défaut module ON ; pas d’override off détecté)

Après migrate (si autorisé) :

- [x] Smoke `GET /health`
- [x] National-fees : seed DB OK (8 rates CI) ; sans auth → 401 (pas de compte démo créé)
- [x] Smoke onglet Finance → Grilles / Soldes (web rebuild `0b661d3`)
- [x] Rapport post-deploy
- [ ] **Pas** de déploiement prod sans go explicite

