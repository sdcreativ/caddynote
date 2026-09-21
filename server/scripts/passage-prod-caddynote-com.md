# Passage prod — `caddynote.sdcreativ.com`

**Date :** 2026-09-05  
**Statut :** ouvert — runtime prod (`CADDYNOTE_DEPLOYMENT=production`) ; reste DNS / HTTPS / ops / pentest.  
**Domaine :** `caddynote.sdcreativ.com` (sous-domaine SDCREATIV sur Hostinger).  
**Copie locale (gitignorée) :** `docs/PASSAGE_PROD_CADDYNOTE_COM.md`  
**Principe :** ne cocher une case qu’après réalisation **et** vérification. Ne pas coller de secrets ici.

Ce fichier referme les trous qui empêchent encore de **vendre** CaddyNote comme prod certifiée. Le code in-repo et le pilote IP (`http://…:8080`) ne suffisent pas.

Guides liés (ne pas dupliquer) :

- Variables : `docs/VARIABLES_ENVIRONNEMENT_PRODUCTION.md`
- Pentest : `docs/PENTEST_BRIEF.md`, `docs/PENTEST_RUNBOOK.md`
- Recette école : `docs/RECETTE_TERRAIN.md`
- Sauvegardes : `docs/SAUVEGARDE_RESTAURATION.md`, `docs/PITR_RUNBOOK.md`
- Deploy staging : `server/scripts/staging-deploy-checklist.md`
- Rebuild fail-closed : `scripts/deploy-staging-rebuild.sh`
- Transfert Hostinger : `server/scripts/passage-hostinger-caddynote-sdcreativ.md`

Cibles d’URL (à confirmer au DNS, puis figer) :

| Service | URL visée |
| --- | --- |
| Front | `https://caddynote.sdcreativ.com` |
| API | same-origin `https://caddynote.sdcreativ.com/api` (préféré pour le cookie) |

---

## 0. Avant de toucher au DNS

Le VPS tient déjà : login, MFA, admin, signatures, isolation tenant, `pilot.ready`. Reste surtout DNS / HTTPS / réseau / SMTP / pentest.

**État VPS (confirmé 2026-09-05) :** `CADDYNOTE_TEST_MODE=false`, `CADDYNOTE_DEPLOYMENT=production` ; `GET /diagnostics` admin global : `pilot.ready === true`, blockers vides ; école remplie ; MFA OK ; admin OK ; signatures OK ; parent, enseignant, établissement réels ; **aucun** `@caddynote.test` ni mot de passe démo.

- [x] École remplie sur le VPS (données métier) — 2026-09-05
- [x] Compte **admin** réel, connexion OK — VPS, 2026-09-05
- [x] Compte **`parent`** réel (rôle `parent`) — VPS, 2026-09-05
- [x] Compte **enseignant** réel + établissement — VPS, 2026-09-05
- [x] MFA staff OK sur l’instance (après correctif cookie HTTP) — VPS, 2026-09-05
- [x] Signatures fonctionnelles — VPS, 2026-09-05
- [x] Aucun compte `@caddynote.test` / mot de passe démo — VPS, 2026-09-05
- [x] `CADDYNOTE_TEST_MODE=false` — VPS, 2026-09-05
- [x] `CADDYNOTE_DEPLOYMENT=production` — VPS, 2026-09-05 (HTTPS / domaine encore à faire)
- [x] `GET /diagnostics` (admin global) : `pilot.ready === true`, blockers vides — VPS, 2026-09-05
- [ ] PV formel de recette signé (`docs/RECETTE_TERRAIN.md` §7) — distinct de « école remplie »

---

## 1. DNS — `caddynote.sdcreativ.com`

- [ ] A (ou AAAA) `caddynote.sdcreativ.com` → IP du VPS Hostinger
- [ ] Si API hors same-origin : A/CNAME `api.caddynote.sdcreativ.com`
- [ ] TTL raisonnable (300–3600) le temps de la bascule
- [ ] Propagation vérifiée (`dig`, pas seulement le registrar)

---

## 2. HTTPS — Caddy (ou équivalent) + Let’s Encrypt

Le cookie `Secure` + `SameSite=None` se déduit de `APP_URL` / `CORS_ORIGIN` en `https://`. Tant que c’est `http://`, le navigateur jette un cookie Secure.

- [ ] Reverse proxy (Caddy recommandé) : 80 → 443, certificats auto
- [ ] Front servi en HTTPS uniquement
- [ ] API uniquement derrière HTTPS (plus de `:4000` public)
- [ ] HSTS une fois le certificat stable (pas le premier jour si on itère)
- [ ] Une seule origine canonique : `https://caddynote.sdcreativ.com`

Préférence cookie / CSRF : same-origin.

```text
https://caddynote.sdcreativ.com        → nginx/caddy → fichiers web
https://caddynote.sdcreativ.com/api/*  → même hôte  → process API
```

Alors `VITE_API_URL` peut rester `/api` (rebuild web). `SameSite=Lax` + `Secure` suffisent.

Si front et API sont sur deux hôtes (`caddynote.sdcreativ.com` + `api.caddynote.sdcreativ.com`) :

- [ ] `COOKIE_SAMESITE=none` et site effectivement en HTTPS
- [ ] `CORS_ORIGIN=https://caddynote.sdcreativ.com` (exact, pas de `*`)
- [ ] Rebuild web avec `VITE_API_URL=https://api.caddynote.sdcreativ.com`

---

## 3. Variables d’environnement (après HTTPS)

Valeurs **fictives** de forme uniquement. Secrets dans `server/.env` / le gestionnaire, jamais ici.

- [ ] `APP_URL=https://caddynote.sdcreativ.com`
- [ ] `API_URL=https://caddynote.sdcreativ.com/api` (ou `https://api.caddynote.sdcreativ.com`)
- [ ] `CORS_ORIGIN=https://caddynote.sdcreativ.com`
- [ ] `VITE_SITE_URL=https://caddynote.sdcreativ.com`
- [ ] `VITE_API_URL` aligné (vide/`/api` si same-origin, sinon URL HTTPS absolue)
- [ ] Rebuild **web** après tout changement `VITE_*`
- [ ] `NODE_ENV=production`, `CADDYNOTE_DEPLOYMENT=production`
- [ ] `JWT_SECRET` fort, dédié prod (pas le secret staging)
- [ ] `FILE_ENCRYPTION_KEY` posée (bloqueur `getPilotReadiness` en staging/prod)
- [ ] Cookie : laisser le défaut (HTTPS → Secure) ; ne forcer `COOKIE_SECURE=false` qu’en HTTP

---

## 4. Fermer la surface réseau

Aujourd’hui (pilote IP) : front `:8080`, API `:4000`, Postgres `:5433` publiés. Inacceptable en vente.

- [ ] Security List / iptables : **80** et **443** seulement (plus **22** restreint à ton IP)
- [ ] Retirer la publication hôte de `:8080`, `:4000`, `:5433`
- [ ] Postgres uniquement sur le réseau Docker (pas `0.0.0.0:5433`)
- [ ] `/metrics` derrière jeton ou réseau privé
- [ ] Vérifier de l’extérieur : `443` OK, `4000`/`5433`/`8080` refusés

---

## 5. E-mail, fichiers, antivirus

- [ ] SMTP réel (`SMTP_HOST` / compte) — reset MDP, admissions, dunning
- [ ] Envoi test (reset ou message interne) reçu, pas seulement logué
- [ ] S3 (ou équivalent) pour pièces et dumps — plus le disque local seul
- [ ] ClamAV **ou** écart écrit (staging ARM : souvent reporté ; **pas** en prod x86 sans décision)
- [ ] `FILE_ENCRYPTION_KEY` + test upload / téléchargement pièce

---

## 6. Sauvegardes et restauration

- [ ] Backup automatique (cron déjà dans l’API) vers un stockage hors VM
- [ ] Exercice de restore sur une base **vide** (pas la prod)
- [ ] RPO / RTO notés (`docs/SAUVEGARDE_RESTAURATION.md`, `docs/PITR_RUNBOOK.md`)

---

## 7. Dépendances et audit

- [ ] `npm audit` (racine + `server/`) : pas de critique non traitée
- [ ] Images Docker à jour (Node 22, nginx, Postgres 16)
- [ ] Job deploy = `scripts/deploy-staging-rebuild.sh` (build puis bascule)

---

## 8. Pentest externe

Hors dépôt. Brief déjà rédigé.

- [ ] Prestataire briefé (`docs/PENTEST_BRIEF.md`)
- [ ] Périmètre : auth, MFA, sessions, tenants, webhooks, uploads, SSO
- [ ] Environnement = HTTPS `caddynote.sdcreativ.com` (pas l’IP HTTP)
- [ ] Comptes `RECETTE_*` / `PENTEST_*` dédiés, pas la prod élèves
- [ ] Correctifs des findings **hauts / critiques**
- [ ] Relance ciblée si le prestataire le demande

---

## 9. Recette finale sur le domaine

- [ ] Login + MFA staff **sur HTTPS** `caddynote.sdcreativ.com` (déjà OK en HTTP staging)
- [ ] Cookie présent (Application → `caddynote_at` : Secure, HttpOnly)
- [ ] CORS : aucune erreur console
- [ ] Parcours direction / enseignant / élève / parent **sur HTTPS** (les comptes existent déjà sur le VPS)
- [ ] Admission publique + recover (message générique, pas d’énumération)
- [ ] Paiement sandbox uniquement jusqu’au go billing live
- [ ] Lighthouse / clavier : pages critiques (accueil, login, notes)

---

## 10. Go / no-go vente

Ne vendre comme prod que si **toutes** les sections 0–9 sont cochées (sauf écarts écrits et acceptés).

- [ ] Pentest sans critique ouverte
- [ ] HTTPS + DNS + ports fermés
- [ ] SMTP + stockage + chiffrement fichiers
- [ ] Restore testé
- [ ] PV recette signé
- [ ] Mentions / support : `contact@caddynote.sdcreativ.com` joignable
- [ ] Interdits toujours faux : `CADDYNOTE_TEST_MODE`, register privilégié, clés `sk_test` pour du vrai argent

**Ordre :** recette 1 école (HTTP OK) → DNS + TLS `caddynote.sdcreativ.com` → durcir le réseau → SMTP/S3/ClamAV → backup/restore → audit npm → pentest → go vente.
