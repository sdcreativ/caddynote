# Commandes VM — self-hosted runner staging (Oracle A1)

À exécuter **après** merge du workflow `deploy_staging_self_hosted` sur `main`.
Guide détaillé : [`oracle-cloud-always-free.md`](./oracle-cloud-always-free.md) §8.

## 1. App sous ubuntu

```bash
sudo usermod -aG docker ubuntu
# reconnecte-toi en ubuntu si besoin

sudo mkdir -p /home/ubuntu/caddynote
# Si clone encore sous /root :
sudo rsync -a /root/caddynote/ /home/ubuntu/caddynote/
sudo chown -R ubuntu:ubuntu /home/ubuntu/caddynote

cd /home/ubuntu/caddynote
# Vérifier .env + server/.env présents
docker compose up -d --build caddynote-db caddynote-api caddynote-web
curl -fsS http://127.0.0.1:4000/health

# Éviter double ports si ancienne stack root :
sudo docker compose -f /root/caddynote/docker-compose.yml --project-directory /root/caddynote down
```

## 2. Deploy key (Mac → GitHub → VM)

```bash
# Mac
ssh-keygen -t ed25519 -f ./caddynote-deploy-ro -N "" -C "caddynote-staging-deploy-ro"
# GitHub → Settings → Deploy keys → Add (public, read-only)
```

```bash
# VM ubuntu
mkdir -p ~/.ssh && chmod 700 ~/.ssh
nano ~/.ssh/caddynote_deploy_ro   # coller la clé privée
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
git remote set-url origin git@github.com:sdcreativ/caddynote.git
ssh -T git@github.com
git fetch origin main
```

## 3. Runner GitHub (Linux ARM64)

1. Repo → **Settings → Actions → Runners → New self-hosted runner**
2. Choisir **Linux** / **ARM64** — exécuter les `curl` / `tar` affichés par GitHub
3. Config :

```bash
cd ~/actions-runner
./config.sh --url https://github.com/sdcreativ/caddynote --token <TOKEN_UI> \
  --name oracle-staging-a1 \
  --labels staging \
  --work _work

sudo ./svc.sh install ubuntu
sudo ./svc.sh start
sudo ./svc.sh status
```

Labels requis : `self-hosted`, `linux`, `ARM64`, `staging`.

## 4. Pare-feu

```bash
sudo iptables -I INPUT 5 -p tcp -m state --state NEW -m tcp --dport 8080 -j ACCEPT
sudo iptables -I INPUT 5 -p tcp -m state --state NEW -m tcp --dport 4000 -j ACCEPT
sudo mkdir -p /etc/iptables
sudo sh -c 'iptables-save > /etc/iptables/rules.v4'
```

## 5. Test

Push sur `main` → Actions → job **Staging — self-hosted rebuild** doit passer.
Puis : `curl -fsS http://IP_PUBLIQUE:4000/health`
