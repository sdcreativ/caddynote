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

### Logs

- `~/Library/Logs/caddynote-nightly-push.log`
- notifications macOS en cas de skip / succès / échec

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
