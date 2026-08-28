# Scripts

Utilitaires de build / SEO / accessibilité (`*.mjs`), hors application React.

## Push nocturne `main` → GitHub (staging VPS)

Option A : **ne committe jamais**. À 03:00 (heure locale), pousse `main` seulement si :

- branche = `main`
- working tree propre
- commits locaux en avance sur `origin/main` (pas de divergence)

### Installation (une fois)

```bash
chmod +x scripts/nightly-push-main.sh scripts/macos/install-nightly-push-launchagent.sh
./scripts/macos/install-nightly-push-launchagent.sh
./scripts/nightly-push-main.sh --dry-run
```

### Clé SSH GitHub (obligatoire pour la nuit)

La clé `~/.ssh/id_github_sdcreativ` est protégée par phrase secrète. Une fois, dans un Terminal :

```bash
ssh-add --apple-use-keychain ~/.ssh/id_github_sdcreativ
```

Ajoutez aussi dans `~/.ssh/config` sous `Host github.com` :

```
UseKeychain yes
AddKeysToAgent yes
```

Sinon le push à 03:00 échouera (agent SSH vide sous `launchd`).

### Logs

- `~/Library/Logs/caddynote-nightly-push.log`
- notifications macOS : push, puis **succès / échec du déploiement** (workflow CI)

### Suivi CI (une fois)

PAT fine-grained avec **Actions: Read** sur le dépôt :

```bash
mkdir -p ~/.config/caddynote && chmod 700 ~/.config/caddynote
printf '%s' 'VOTRE_TOKEN' > ~/.config/caddynote/github_token
chmod 600 ~/.config/caddynote/github_token
```

### Mac en veille à 03:00

`launchd` exécute le job au **prochain réveil**. Pour forcer un réveil nocturne (optionnel) :

```bash
sudo pmset repeat wakeorpoweron MTWRFSU 02:55:00
```

### Désinstallation

```bash
launchctl bootout "gui/$(id -u)/com.sdcreativ.caddynote.nightly-push"
rm -f ~/Library/LaunchAgents/com.sdcreativ.caddynote.nightly-push.plist
```

## `scripts/components/`

Miroir local éventuel de `src/components` — **hors runtime**. Vite et le bundler ne l’utilisent pas. Ignoré par git (`.gitignore`) et par Cursor (`.cursorignore`). Ne pas y développer de fonctionnalités ; travailler uniquement sous `src/`.
