# Oracle Cloud Always Free — CaddyNote : documentation complète

Guide opérationnel pour déployer CaddyNote sur une VM **Always Free** (région **France Central / Paris**).

Compléments :
- [`staging-deploy-checklist.md`](./staging-deploy-checklist.md) — secrets GitHub / CI
- Ne jamais committer `server/.env`, clés SSH privées, ni mots de passe

---

## Sommaire

1. [Choix Always Free](#1-choix-always-free)
2. [Parcours A — Réseau d’abord, puis instance](#2-parcours-a--réseau-dabord-puis-instance) (**recommandé**)
3. [Parcours B — Instance d’abord (assistant intégré)](#3-parcours-b--instance-dabord-assistant-intégré)
4. [Après création de l’instance](#4-après-création-de-linstance)
5. [Sécurité (Security List / ports)](#5-sécurité-security-list--ports)
6. [SSH + Docker + CaddyNote](#6-ssh--docker--caddynote)
7. [Dépannage](#7-dépannage)

---

## 1. Choix Always Free

| Élément | Recommandé | À éviter pour du gratuit |
|--------|------------|---------------------------|
| Forme | **`VM.Standard.A1.Flex`** (Ampere) 1–2 OCPU, 6–12 Go | `VM.Standard.E4.Flex` et autres Flex payants |
| Alternative | `VM.Standard.E2.1.Micro` (1 Go) + swap | — |
| Image | **Canonical Ubuntu 22.04** | Oracle Linux possible, plus de friction Docker |
| Instance protégée (Shielded) | **OFF** | — |
| IP publique | **Oui** | Instance sans IP publique |

Noms suggérés :

| Ressource | Nom |
|-----------|-----|
| VCN | `vcn-caddynote` |
| Subnet public | `subnet-caddynote-public` |
| Internet Gateway | `igw-caddynote` |
| Route table publique | `rt-public-caddynote` |
| Instance | `caddynote-staging` |

CIDR classiques :

| Ressource | CIDR |
|-----------|------|
| VCN | `10.0.0.0/16` |
| Subnet public | `10.0.0.0/24` |
| Route Internet | **`0.0.0.0/0`** → Internet Gateway (**pas** `/24`) |

---

## 2. Parcours A — Réseau d’abord, puis instance

**À privilégier.** Contourne le bug fréquent de l’assistant d’instance où le toggle *IP publique* reste grisé.

### A.1 Créer le VCN

1. Menu ☰ → **Networking** → **Virtual cloud networks**
2. **Create VCN** (création manuelle suffit)
3. Renseigner :
   - Nom : `vcn-caddynote`
   - IPv4 CIDR : `10.0.0.0/16`
4. Create → état **Available**

> Si tu utilises le wizard **VCN with Internet Connectivity**, il peut créer subnet + IGW + routes automatiquement. Sinon, enchaîne A.2 → A.4.

### A.2 Créer l’Internet Gateway

1. Ouvre `vcn-caddynote` → onglet **Gateways**
2. **Create Internet Gateway**
   - Nom : `igw-caddynote`
3. Create → **Available**

### A.3 Créer la route table publique

1. Onglet **Routing** → **Create Route Table**
2. Nom : `rt-public-caddynote`
3. **Add Route Rules** :

| Champ | Valeur |
|--------|--------|
| Target type | **Internet Gateway** (jamais *Private IP*) |
| Destination CIDR | **`0.0.0.0/0`** |
| Target | `igw-caddynote` |

4. Tu dois voir **1** règle

> Erreur *« Rules … must use private IP as a target »* : tu as choisi le mauvais *Target type*, ou l’IGW n’est pas encore Available. Recrée la règle avec **Internet Gateway**.

La **Default Route Table** peut rester à **0** règle (OK pour le privé).

### A.4 Créer le sous-réseau public

1. Onglet **Subnets** → **Create Subnet**
2. Renseigner :

| Champ | Valeur |
|--------|--------|
| Nom | `subnet-caddynote-public` |
| CIDR | `10.0.0.0/24` |
| Subnet access | **Public** |
| Route Table | **`rt-public-caddynote`** |
| Security List | Default (ou dédiée, voir §5) |

3. Create → **Available**

### A.5 Créer l’instance (après le sous-réseau)

1. ☰ → **Compute** → **Instances** → **Create instance**
2. **Informations de base**
   - Nom : `caddynote-staging`
   - Image : **Ubuntu 22.04**
   - Forme : **`VM.Standard.A1.Flex`** (2 OCPU / 12 Go si possible)
   - Instance protégée : **OFF**
3. **Sécurité** : Suivant
4. **Réseau**
   - **Sélectionner un VCN existant** → `vcn-caddynote`
   - **Sélectionner un sous-réseau existant** → `subnet-caddynote-public`
   - IPv4 privée : auto
   - **Affecter une adresse IPv4 publique** : **ON / Oui**
   - Clé SSH : coller le contenu de `~/.ssh/xxx.pub`
5. **Stockage** : défaut (~47 Go), pas de block volume supplémentaire
6. **Vérifier** → **Créer**

Génération de clé (Mac) :

```bash
ssh-keygen -t ed25519 -f ~/.ssh/id_oracle_caddynote -C "caddynote-oracle"
cat ~/.ssh/id_oracle_caddynote.pub
```

---

## 3. Parcours B — Instance d’abord (assistant intégré)

Possible, mais l’UI Oracle affiche souvent :

> *Vous devez sélectionner un sous-réseau public…*  
> avec le toggle IP publique **grisé**, même après « Créer un sous-réseau public ».

### B.1 Si tu veux quand même l’assistant

1. Create instance → Ubuntu + A1 Flex
2. Réseau → **Créer un VCN** + **Créer un sous-réseau public**
3. Si le toggle IP publique s’active → ON + clé SSH → Create

### B.2 Si le toggle reste grisé

**Abandonne l’assistant** et bascule sur le **Parcours A** (réseau d’abord).  
C’est le cas le plus fréquent à Paris / sur les comptes Free Tier récents.

### B.3 Variante : créer seulement le subnet après un VCN déjà là

Si `vcn-caddynote` existe déjà **sans** subnet public :

1. Crée IGW + `rt-public-caddynote` (§ A.2–A.3)
2. Crée `subnet-caddynote-public` (§ A.4)
3. Recrée l’instance en **sélectionnant** ce subnet (§ A.5)

---

## 4. Après création de l’instance

Sur la fiche instance :

| Élément | Attendu |
|---------|---------|
| État | **Running** |
| Image | Ubuntu (user SSH `ubuntu`) ou Oracle Linux (user `opc`) |
| **IP publique** | présente (ex. `xxx.xxx.xxx.xxx`) |
| VCN / subnet | `vcn-caddynote` / `subnet-caddynote-public` |

Note l’IP publique : ce sera ton futur `STAGING_HOST`.

---

## 5. Sécurité (Security List / ports)

1. VCN → **Security** / **Security Lists** → liste du subnet public  
2. **Add Ingress Rules** :

| Source CIDR | Protocole | Port | Usage |
|-------------|-----------|------|--------|
| `TON_IP/32` (idéal) ou `0.0.0.0/0` | TCP | 22 | SSH |
| `0.0.0.0/0` | TCP | 8080 | Front CaddyNote |
| `0.0.0.0/0` | TCP | 4000 | API (staging) |
| `0.0.0.0/0` | TCP | 80 | HTTP (plus tard) |
| `0.0.0.0/0` | TCP | 443 | HTTPS (plus tard) |

Sans ces règles, SSH et HTTP timeout même avec IP publique.

---

## 6. SSH + Docker + CaddyNote

### 6.1 Connexion

```bash
# Ubuntu
ssh -i ~/.ssh/id_oracle_caddynote ubuntu@IP_PUBLIQUE

# Oracle Linux
ssh -i ~/.ssh/id_oracle_caddynote opc@IP_PUBLIQUE
```

### 6.2 Docker (Ubuntu)

```bash
sudo apt update
sudo apt install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker "$USER"
exit   # puis reconnecte-toi
```

### 6.3 Swap (surtout si Micro 1 Go)

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 6.4 Code + env

```bash
mkdir -p ~/caddynote && cd ~/caddynote
git clone https://github.com/sdcreativ/caddynote.git .
cp .env.example .env
cp server/.env.example server/.env
```

`.env` racine (exemple) :

```env
WEB_PORT=8080
API_PORT=4000
POSTGRES_USER=caddynote
POSTGRES_PASSWORD=CHANGE_ME_POSTGRES
POSTGRES_DB=caddynote
VITE_API_URL=http://IP_PUBLIQUE:4000
VITE_SITE_URL=http://IP_PUBLIQUE:8080
CADDYNOTE_PROCESS_ROLE=all
```

`server/.env` minimal :

```env
CADDYNOTE_DEPLOYMENT=staging
CADDYNOTE_TEST_MODE=false
CADDYNOTE_PROCESS_ROLE=all
PORT=4000
DATABASE_URL=postgresql://caddynote:CHANGE_ME_POSTGRES@localhost:5433/caddynote
JWT_SECRET=GENERE_AVEC_openssl_rand_base64_48
JWT_EXPIRES_IN=12h
# Obligatoire en staging (openssl rand -hex 32) — sinon l’API refuse de démarrer
FILE_ENCRYPTION_KEY=
CORS_ORIGIN=http://IP_PUBLIQUE:8080
APP_URL=http://IP_PUBLIQUE:8080
API_URL=http://IP_PUBLIQUE:4000
BOOTSTRAP_ADMIN_EMAIL=toi@exemple.com
BOOTSTRAP_ADMIN_PASSWORD=MOT_DE_PASSE_FORT
# Optionnel sur ARM ; obligatoire uniquement en production (x86 + ClamAV)
CLAMAV_HOST=
```

### 6.5 Démarrage

```bash
# Sans ClamAV (défaut) : pas d'image ARM64 officielle sur Oracle A1.
# Antivirus optionnel x86 uniquement : --profile antivirus + CLAMAV_HOST=clamav
# HTTPS / domaine : chantier ops suivant (Caddy + Let’s Encrypt), pas requis pour ce guide HTTP.
docker compose up -d --build caddynote-db caddynote-api caddynote-web

docker compose ps
curl -sS http://127.0.0.1:4000/health
```

Depuis ton Mac :

```bash
curl -sS http://IP_PUBLIQUE:4000/health
# Navigateur : http://IP_PUBLIQUE:8080
```

---

## 7. Dépannage

| Symptôme | Cause | Action |
|----------|--------|--------|
| Toggle IP publique grisé | Subnet privé / bug assistant | **Parcours A** |
| Liste de formes Always Free vide | Mauvais onglet / saturation | Ampere → A1, ou autre AD, ou réessayer plus tard |
| Erreur route « private IP as target » | Mauvais Target type | Target = **Internet Gateway**, CIDR `0.0.0.0/0` |
| SSH timeout | Pas de règle 22 / pas d’IP publique | Security List + vérifier IP |
| OOM / containers kill | RAM insuffisante | A1 12 Go, ou swap, pas de ClamAV |
| CORS / front sans API | Mauvaise IP dans env | Rebuild web avec `VITE_API_URL` correct |
| Forme E4.Flex | Payant | Repasser sur A1 / E2.1.Micro |

---

## Récap des deux sens

```text
PARCOURS A (recommandé)
  VCN → IGW → Route table (0.0.0.0/0 → IGW)
      → Subnet PUBLIC lié à cette route table
      → Instance (VCN+subnet existants, IP publique ON)
      → Security List → SSH → Docker → CaddyNote

PARCOURS B (assistant instance)
  Create instance → créer VCN+subnet dans l’assistant
      → SI IP publique OK → Create
      → SINON → abandonner et faire le Parcours A
```

---

## Suite

1. MFA sur le compte Oracle  
2. Domaine + HTTPS  
3. **Self-hosted runner** (déploiement auto au push `main`) — §8 ci-dessous  
4. Optionnel : Docker Hub + [`deploy-staging.yml`](../../.github/workflows/deploy-staging.yml) (`workflow_dispatch`) — voir `staging-deploy-checklist.md`

---

## 8. Self-hosted runner (déploiement auto)

Objectif : push sur `main` → CI GitHub-hosted (tests) → job `deploy_staging_self_hosted` sur la VM → `git pull` + `docker compose up --build`.

Pas besoin de Docker Hub ni de `STAGING_SSH_KEY` pour ce mode.

### 8.1 App sous `ubuntu` (pas root)

Si le clone est encore dans `/root/caddynote` :

```bash
# En root ou via sudo
sudo mkdir -p /home/ubuntu/caddynote
sudo rsync -a /root/caddynote/ /home/ubuntu/caddynote/
sudo chown -R ubuntu:ubuntu /home/ubuntu/caddynote
sudo usermod -aG docker ubuntu
```

Vérifier que `.env` et `server/.env` sont bien présents sous `/home/ubuntu/caddynote`, puis (en `ubuntu`) :

```bash
cd /home/ubuntu/caddynote
docker compose up -d --build caddynote-db caddynote-api caddynote-web
curl -fsS http://127.0.0.1:4000/health
```

Arrêter l’ancienne stack root pour éviter un double bind de ports :

```bash
sudo docker compose -f /root/caddynote/docker-compose.yml --project-directory /root/caddynote down
```

### 8.2 Deploy key (git fetch depuis le job)

Repo privé : le runner a besoin de tirer `origin/main` dans `APP_DIR`.

Sur ton Mac :

```bash
ssh-keygen -t ed25519 -f ./caddynote-deploy-ro -N "" -C "caddynote-staging-deploy-ro"
```

- GitHub → repo → **Settings → Deploy keys → Add** : coller `caddynote-deploy-ro.pub` (lecture seule).
- Sur la VM (ubuntu) :

```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
# Coller la clé PRIVÉE dans ~/.ssh/caddynote_deploy_ro
chmod 600 ~/.ssh/caddynote_deploy_ro
cat >> ~/.ssh/config <<'EOF'
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/caddynote_deploy_ro
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config
cd /home/ubuntu/caddynote
git remote -v
# Si HTTPS : passer en SSH
git remote set-url origin git@github.com:sdcreativ/caddynote.git
ssh -T git@github.com
git fetch origin main
```

### 8.3 Installer le runner (Linux ARM64)

1. GitHub → repo → **Settings → Actions → Runners → New self-hosted runner**
2. OS **Linux**, Architecture **ARM64**
3. Sur la VM en `ubuntu` :

```bash
mkdir -p ~/actions-runner && cd ~/actions-runner
# Copier depuis l’UI GitHub (Linux / ARM64) : curl + tar + ./config.sh
# Ne pas inventer l’URL : Settings → Actions → Runners → New self-hosted runner
./config.sh --url https://github.com/sdcreativ/caddynote --token <TOKEN_GITHUB_UI> \
  --name oracle-staging-a1 \
  --labels staging \
  --work _work
```

Labels attendus par le job CI : `self-hosted`, `linux`, `ARM64`, `staging`  
(`self-hosted` / `linux` / `ARM64` sont ajoutés automatiquement ; ajouter **`staging`** dans `--labels`).

Service systemd (toujours en `ubuntu`, pas root) :

```bash
sudo ./svc.sh install ubuntu
sudo ./svc.sh start
sudo ./svc.sh status
```

Dans GitHub → Runners : le runner doit apparaître **Idle**.

### 8.4 Pare-feu local OCI (iptables)

Les images Ubuntu OCI n’ouvrent souvent que le port 22. Après Security List 8080/4000 :

```bash
sudo iptables -I INPUT 5 -p tcp -m state --state NEW -m tcp --dport 8080 -j ACCEPT
sudo iptables -I INPUT 5 -p tcp -m state --state NEW -m tcp --dport 4000 -j ACCEPT
sudo mkdir -p /etc/iptables
sudo sh -c 'iptables-save > /etc/iptables/rules.v4'
```

### 8.5 Variable optionnelle

Repo → **Settings → Variables → Actions** : `STAGING_APP_DIR` = `/home/ubuntu/caddynote` (défaut du workflow si absente).

### 8.6 Vérification

1. Petit commit / push sur `main`
2. Actions : jobs tests verts, puis **Staging — self-hosted rebuild**
3. `curl -fsS http://IP_PUBLIQUE:4000/health` et front `:8080`

ClamAV reste **désactivé** par défaut (pas d’image ARM64) ; profil `antivirus` réservé au x86_64.
