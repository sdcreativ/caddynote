# Passage Hostinger — `caddynote.sdcreativ.com`

**Date :** 2026-09-21  
**Statut :** ouvert — fichiers dépôt prêts ; DNS / dump / TLS / SSH **sur autorisation**.  
**Cible :** `https://caddynote.sdcreativ.com` (same-origin `/api`) sur le VPS Hostinger.  
**Emplacement :** `/var/www/caddynote` — même parent que `/var/www/kodiva` et `/var/www/sdcreativ`.  
**Principe :** ne cocher une case qu’après réalisation **et** vérification. Ne pas coller de secrets ici. Ne pas modifier kodiva ni sdcreativ.

Guides liés :

- Staging Oracle : [`staging-deploy-checklist.md`](./staging-deploy-checklist.md)
- Prod `caddynote.com` (plus tard) : [`passage-prod-caddynote-com.md`](./passage-prod-caddynote-com.md)
- Overlay Compose : [`../../docker-compose.hostinger.yml`](../../docker-compose.hostinger.yml)
- Vhost Nginx hôte : [`../../nginx/hostinger-caddynote.sdcreativ.com.conf`](../../nginx/hostinger-caddynote.sdcreativ.com.conf)
- Block Caddy hôte : [`../../nginx/Caddyfile.hostinger`](../../nginx/Caddyfile.hostinger)

```text
/var/www/
  kodiva/       ← inchangé
  sdcreativ/    ← inchangé
  caddynote/    ← clone git + docker compose (ce chantier)

Internet → proxy existant :80/:443 (kodiva, sdcreativ, …)
         → vhost caddynote.sdcreativ.com → 127.0.0.1:18080 (caddynote-web)
              /api/*  → caddynote-api:4000 (nginx du conteneur)
              reste   → SPA
```

CaddyNote n’utilise **pas** `root /var/www/caddynote` comme kodiva/sdcreativ : c’est une SPA + API Docker. Le dossier `/var/www/caddynote` est le **dépôt** ; nginx hôte **proxy** vers le conteneur.

---

## 0. Ne pas casser kodiva / sdcreativ

- [ ] `ls /var/www` : `kodiva` et `sdcreativ` présents
- [ ] Identifier qui écoute **80/443** : `ss -tlnp | grep -E ':80|:443'`
- [ ] Noter le proxy (Nginx, Apache, Caddy…) **avant** d’ajouter un vhost
- [ ] **Ajouter** un `server` / un block, ne **pas** remplacer la config globale
- [ ] Vérifier kodiva **et** sdcreativ après `nginx -t` / reload

---

## 1. DNS — panel Hostinger (`sdcreativ.com`)

Valeurs de forme uniquement.

- [ ] Enregistrement **A** `caddynote` → IP publique du VPS Hostinger  
      (ou CNAME `caddynote` → hôte déjà pointé vers cette IP)
- [ ] TTL 300–3600 le temps de la bascule
- [ ] Propagation : `dig +short caddynote.sdcreativ.com` = IP Hostinger

---

## 2. Préparer `/var/www/caddynote`

Utilisateur `deploy` (déjà propriétaire de `/var/www`) :

```bash
docker compose version

# Ne pas toucher à kodiva / sdcreativ
ls /var/www
sudo -u deploy mkdir -p /var/www/caddynote
cd /var/www/caddynote
git clone git@github.com:sdcreativ/caddynote.git .
```

- [ ] Dossier `/var/www/caddynote` créé, owned par `deploy`
- [ ] `kodiva` et `sdcreativ` toujours intacts
- [ ] Docker Compose v2
- [ ] Clone à jour (`main`)
- [ ] Copier `.env.example` → `.env` racine (voir §3)
- [ ] Copier `server/.env` **depuis Oracle** (SCP), puis n’y changer que les URL (§3)

---

## 3. Variables (forme, pas de secrets)

Racine `/var/www/caddynote/.env` (build web + overlay) :

```text
VITE_SITE_URL=https://caddynote.sdcreativ.com
VITE_API_URL=
CORS_ORIGIN=https://caddynote.sdcreativ.com
CADDYNOTE_DEPLOYMENT=production
WEB_PORT=127.0.0.1:18080
API_PORT=127.0.0.1:14000
POSTGRES_PORT=127.0.0.1:5433
```

`/var/www/caddynote/server/.env` : **conserver** `JWT_SECRET`, `FILE_ENCRYPTION_KEY`, SMTP, S3. Modifier seulement :

```text
APP_URL=https://caddynote.sdcreativ.com
API_URL=https://caddynote.sdcreativ.com/api
CORS_ORIGIN=https://caddynote.sdcreativ.com
CADDYNOTE_DEPLOYMENT=production
CADDYNOTE_TEST_MODE=false
COOKIE_SAMESITE=lax
```

Ne **pas** forcer `COOKIE_SECURE=false` ni `COOKIE_SAMESITE=none`.

- [ ] `.env` racine posé
- [ ] `server/.env` copié depuis Oracle puis URL alignées
- [ ] Postgres compose : mot de passe URL-safe (pas de `@ : /`) identique Oracle si restore dump

---

## 4. Dump Oracle → restore Hostinger

Fenêtre courte. Remplacer les chemins **sans** coller de mot de passe dans ce fichier.

### 4.1 Dump (Oracle)

```bash
ssh … 'cd ~/caddynote && docker compose exec -T caddynote-db \
  pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' > caddynote-$(date +%Y%m%d).dump

# Si S3 n’est pas configuré, copier aussi les pièces locales :
# docker compose cp caddynote-api:/app/uploads ./uploads-oracle
```

- [ ] Dump `pg_dump -Fc` obtenu
- [ ] Taille du fichier non nulle
- [ ] Uploads copiés **ou** S3 inchangé (mêmes clés)

### 4.2 Transfert

```bash
scp caddynote-YYYYMMDD.dump deploy@HOSTINGER:/var/www/caddynote/
```

- [ ] Fichier présent sous `/var/www/caddynote/`

### 4.3 Restore (Hostinger)

```bash
cd /var/www/caddynote
docker compose -f docker-compose.yml -f docker-compose.hostinger.yml up -d caddynote-db

docker compose -f docker-compose.yml -f docker-compose.hostinger.yml exec -T caddynote-db \
  pg_restore --clean --if-exists --no-owner -U caddynote -d caddynote < caddynote-YYYYMMDD.dump
```

Puis stack complète + migrations (no-op si dump à jour) :

```bash
cd /var/www/caddynote
docker compose -f docker-compose.yml -f docker-compose.hostinger.yml up -d --build \
  caddynote-db caddynote-api caddynote-web
docker compose -f docker-compose.yml -f docker-compose.hostinger.yml exec -T caddynote-api \
  npx prisma migrate deploy
```

- [ ] Restore sans erreur bloquante
- [ ] `curl -fsS http://127.0.0.1:14000/health` → 200
- [ ] Recette login / MFA / parent via `http://127.0.0.1:18080` avant DNS public
- [ ] `ls /var/www` : kodiva et sdcreativ toujours là

### 4.4 Cutover DNS

- [ ] Recette Hostinger OK
- [ ] DNS `caddynote` → IP Hostinger
- [ ] Freeze écritures Oracle (maintenance courte)
- [ ] Dump final + restore delta si des écritures ont eu lieu
- [ ] Oracle laissé allumé en repli **ce jour-là** (arrêt plus tard)

---

## 5. TLS — un vhost seulement

### Nginx (hôte)

```bash
sudo cp /var/www/caddynote/nginx/hostinger-caddynote.sdcreativ.com.conf \
  /etc/nginx/sites-available/caddynote.sdcreativ.com.conf
sudo ln -s /etc/nginx/sites-available/caddynote.sdcreativ.com.conf \
  /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d caddynote.sdcreativ.com
```

### Caddy (hôte)

Ajouter le block de [`nginx/Caddyfile.hostinger`](../../nginx/Caddyfile.hostinger) au Caddyfile existant, puis reload Caddy.

- [ ] `https://caddynote.sdcreativ.com` cadenas OK
- [ ] kodiva **et** sdcreativ toujours UP
- [ ] Pas d’HSTS agressif le premier jour

---

## 6. Pare-feu

- [ ] 80 / 443 déjà ouverts (sites existants)
- [ ] **Ne pas** ouvrir 8080, 4000, 5433, 18080, 14000 sur Internet
- [ ] Depuis l’extérieur : `443` OK ; `18080` / `14000` / `4000` / `5433` refusés

---

## 7. Recette publique

- [ ] `https://caddynote.sdcreativ.com` charge
- [ ] `https://caddynote.sdcreativ.com/api/health` → 200
- [ ] Login + cookie `caddynote_at` : Secure, HttpOnly, SameSite=Lax
- [ ] Parcours direction / enseignant / élève / parent
- [ ] Sites kodiva et `sdcreativ.com` toujours OK
- [ ] Canonical / OG : origine `https://caddynote.sdcreativ.com`

---

## 8. Hors de ce chantier

- GitHub Actions `deploy-staging` : toujours Oracle
- Extinction Oracle
- Bascule `caddynote.com`
