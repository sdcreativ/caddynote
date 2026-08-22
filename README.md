# PROCEDURE DE MISE EN PLACE DEVOPS

- **CI/CD**
- **Nginx**
- **Dockerfile**
- **Docker compose**

## Pipeline CI/CD

### **1. Construire et Démarrer toute la stack**

    Cette commande est la première et la plus importante. Elle va lire `docker-compose.yml`, construire les images `caddynote-web` et `caddynote-api` (si elles n'existent pas ou si les Dockerfiles ont changé), démarrer Postgres applicatif (`caddynote-db`, port hôte 5433) et ClamAV. Copier `.env.example` vers `.env` à la racine et garder `server/.env` (JWT, SMTP…). L'API applique `prisma migrate deploy` au démarrage.

```bash
  docker-compose up -d
  # ou 
  docker-compose up --build -d
```
- `up` : Démarre les services.

- `--build` : Force la reconstruction de l'image de ton application. C'est une bonne habitude à prendre quand tu as modifié ton code.

- `-d `: (detached mode) Lance les conteneurs en arrière-plan pour que tu puisses continuer à utiliser ton terminal.

### **2. Vérifier que tout fonctionne**

   Après quelques instants, tu peux vérifier que tous tes conteneurs sont bien en cours d'exécution et en bonne santé.

```bash
  docker-compose ps
  # ou  la version moderne
  docker compose ps
```

### **3. Accéder aux services dans ton navigateur**
   
    Maintenant, tu peux ouvrir les différentes parties de ton application :

- Application web : `http://localhost:8080` (ou `WEB_PORT`)
- API : `http://localhost:4000/health`
- Mailpit (e-mails locaux, optionnel) :
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.mail.yml --profile mail up -d
  ```
  puis `http://localhost:8025`

#### L'application CaddyNote :

- Frontend : http://localhost:8080
- API : http://localhost:4000 (`/health`, `/docs`)
- Postgres (hôte) : `localhost:5433` (caddynote-db). `npm run dev` doit viser **le même** port dans `server/.env`, sinon une deuxième base sur 5432. `GET /health` → `databaseTarget`.

### **4.Consulter les logs (en cas de problème)
   Si un conteneur ne démarre pas correctement, la première chose à faire est de regarder ses logs.

- Pour voir les logs de tous les services en temps réel :
```bash
  docker-compose logs -f
```
- Pour voir les logs d'un service spécifique :
```bash
  docker compose logs -f caddynote-web
  docker compose logs -f caddynote-api
  docker compose logs -f caddynote-db
```

#### 5. Arrêter l'environnement

- Quand tu as fini de travailler, tu peux arrêter tous les conteneurs avec cette simple commande.
```bash
  docker-compose down
```
_Cette commande arrête et supprime les conteneurs. Le volume Postgres `caddynote_pgdata` est conservé._

6. Nettoyage complet (Optionnel)
   Si tu veux repartir de zéro et supprimer également les volumes (Postgres applicatif **inclus**), tu peux utiliser cette commande. Attention : cela efface `caddynote_pgdata`.

```bash
  docker compose down -v
```
- `-v` : Supprime les volumes nommés associés à la stack.

---

guide pas à pas pour configurer les secrets nécessaires à ton projet CaddyNote sur GitHub.

### Étape 1 : Identifier les secrets nécessaires
En analysant ton fichier de pipeline, voici les secrets que tu dois créer :

- `DOCKER_USERNAME` : Ton nom d'utilisateur Docker Hub.

- `DOCKER_PASSWORD` : Ton mot de passe Docker Hub. (Fortement recommandé : utilise un Token d'Accès plutôt que ton mot de passe réel).

### Secrets pour le déploiement (si tu utilises l'exemple SSH) :

- `SSH_USER` : Le nom d'utilisateur pour se connecter à ton serveur de production (ex: ubuntu, root).

- `SSH_HOST` : L'adresse IP ou le nom de domaine de ton serveur.

- `SSH_PRIVATE_KEY` : La clé SSH privée pour se connecter à ton serveur sans mot de passe.

### Étape 2 : Créer un Token d'Accès sur Docker Hub (Recommandé)
Utiliser un token d'accès est beaucoup plus sécurisé que d'utiliser ton mot de passe principal.

1. Connecte-toi à Docker Hub.

2. Clique sur ton nom d'utilisateur en haut à droite, puis va dans Account Settings.

3. Dans le menu de gauche, clique sur Security.

4. Clique sur le bouton New Access Token.

5. Donne une description à ton token, par exemple `CaddyNote GitHub Actions`.

6. Laisse les permissions par défaut (Read, Write, Delete).

7. Clique sur Generate.

**ATTENTION** : `Docker Hub` n'affichera le `token` qu'une seule fois. Copie-le immédiatement et garde-le en lieu sûr le temps de l'ajouter à GitHub. C'est ce token que tu utiliseras pour le secret `DOCKER_PASSWORD`.

### Étape 3 : Ajouter les secrets dans ton dépôt GitHub

1. Va sur la page de ton dépôt GitHub pour le projet CaddyNote.

2. Clique sur l'onglet Settings.

3. Dans le menu de gauche, navigue vers Secrets and variables > Actions.

4. Clique sur le bouton vert New repository secret.

5. Maintenant, ajoute chaque secret un par un :

#### Pour le nom d'utilisateur Docker :

- Name: `DOCKER_USERNAME`

- Secret: Ton nom d'utilisateur Docker Hub (ex: caddynote-user)

6. Clique sur Add secret.

#### Pour le token d'accès Docker :

- Name: `DOCKER_PASSWORD`

- Secret: `Colle le token d'accès que tu as généré à l'étape précédente`.

7. Clique sur Add secret.

### Pour les secrets de déploiement (si besoin) :

1. Name: SSH_HOST

2. Secret: L'adresse IP de ton serveur.

3. Clique sur Add secret.

4. Name: SSH_USER

5. Secret: Le nom d'utilisateur de ton serveur.

6. Clique sur Add secret.

- Name: SSH_PRIVATE_KEY

- Secret: Colle ici le contenu complet de ta clé SSH privée (le fichier qui commence généralement par -----BEGIN OPENSSH PRIVATE KEY-----).

7. Clique sur Add secret.

### Se connecter depuis le terminal :

```bash
  docker login -u teamflp
```

```PowerShell
  aegis/
├── go.mod              # Fichier de gestion des modules et dépendances Go (remplace Cargo.toml)
├── README.md           # Documentation principale du projet Aegis
│
├── main.go             # Point d'entrée principal et très simple, qui exécute la commande root de la CLI.
│
├── cmd/                # Convention Go pour le code de la ligne de commande (équivalent de src/cli.rs)
│   ├── root.go         # Définit la commande principale `aegis` avec la librairie Cobra.
│   ├── generate.go     # Définit la sous-commande `aegis generate`.
│   ├── deploy.go       # Définit la sous-commande `aegis deploy`.
│   └── audit.go        # Définit la sous-commande `aegis audit`.
│
├── internal/           # Logique interne de l'application (l'équivalent de la librairie en Rust).
│   ├── config/         # Définit les structures de données (ProjectConfig, etc.)
│   │   └── types.go
│   │
│   ├── generator/      # Cœur de la logique de génération de fichiers (équivalent de src/generator.rs)
│   │   └── generator.go
│   │
│   ├── lifecycle/      # Logique pour les commandes `deploy`, `down`, etc. (équivalent de src/lifecycle.rs)
│   │   └── docker.go
│   │
│   ├── security/       # Fonctions de sécurité : génération de mdp, etc. (équivalent de src/security.rs)
│   │   └── password.go
│   │
│   ├── ui/             # Gère toute l'interaction utilisateur avec la librairie Survey (équivalent de la logique dialoguer)
│   │   └── prompts.go
│   │
│   └── util/           # Fonctions utilitaires diverses (équivalent de src/utils.rs)
│       └── checks.go   # Fonctions comme IsDockerRunning(), IsGitInstalled()
│
└── templates/          # CE RÉPERTOIRE NE CHANGE PAS. Il contient toujours tous les fichiers .tpl
    ├── cicd/
    ├── database/
    ├── docker/
    ├── monitoring/
    └── project_root/
```