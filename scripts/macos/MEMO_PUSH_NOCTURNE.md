# Mémo — Push nocturne CaddyNote (03:00)

Push automatique de `main` vers GitHub **sans commit auto**.  
Le VPS staging se met à jour via le CI GitHub après le push.

---

## Une seule fois — clé SSH dans le Keychain

```bash
ssh-add --apple-use-keychain ~/.ssh/id_github_sdcreativ
```

(Entrez la phrase secrète quand macOS la demande.)

Dans `~/.ssh/config`, sous `Host github.com` (déjà fait si configuré) :

```
UseKeychain yes
AddKeysToAgent yes
```

---

## Une seule fois — installer le LaunchAgent

```bash
cd ~/Sites/localhost/scolartrack
chmod +x scripts/nightly-push-main.sh scripts/macos/install-nightly-push-launchagent.sh
./scripts/macos/install-nightly-push-launchagent.sh
```

---

### Notifications (push + déploiement)

Après un push réussi, le script **attend le workflow GitHub « CI CaddyNote »** puis affiche une notification macOS :

- « Réussi — staging à jour (abc1234) »
- ou « Échoué (failure) — abc1234 »

Pas dans le Terminal : regardez le Centre de notifications, ou :

```bash
tail -50 ~/Library/Logs/caddynote-nightly-push.log
```

#### Jeton GitHub (une fois) — requis pour le suivi CI

`gh` n’est pas nécessaire. Créez un [PAT fine-grained](https://github.com/settings/tokens?type=beta) avec permission **Actions: Read** sur le dépôt `caddynote`, puis :

```bash
mkdir -p ~/.config/caddynote
chmod 700 ~/.config/caddynote
printf '%s' 'VOTRE_TOKEN' > ~/.config/caddynote/github_token
chmod 600 ~/.config/caddynote/github_token
```

Sans ce fichier (ni `GH_TOKEN` / `GITHUB_TOKEN`), le push fonctionne quand même, mais la notification de déploiement sera un rappel de configuration.

---

## Tester (simulation, ne pousse pas)

```bash
cd ~/Sites/localhost/scolartrack
./scripts/nightly-push-main.sh --dry-run
```

Résultat attendu si des commits sont prêts :

- `Push de N commit(s)…`
- `DRY-RUN : git push origin main (non exécuté)`

Si le working tree n’est pas propre → `SKIP working tree sale` (normal : committez d’abord).

---

## Routine quotidienne

1. Travailler et **committer** quand c’est prêt (`git commit`).
2. Ne pas forcément pousser le soir.
3. À **03:00**, le Mac pousse `main` si :
   - branche = `main`
   - aucun fichier non commité
   - commits locaux en avance sur `origin/main`

---

## Logs

```bash
tail -f ~/Library/Logs/caddynote-nightly-push.log
```

Autres logs launchd :

```bash
tail -20 ~/Library/Logs/caddynote-nightly-push.launchd.out.log
tail -20 ~/Library/Logs/caddynote-nightly-push.launchd.err.log
```

---

## Vérifier que le job est installé

```bash
launchctl print "gui/$(id -u)/com.sdcreativ.caddynote.nightly-push" | head -30
```

---

## Forcer un push maintenant (manuel)

```bash
cd ~/Sites/localhost/scolartrack
./scripts/nightly-push-main.sh
```

Ou classique :

```bash
git push origin main
```

---

## Mac en veille à 03:00 (optionnel)

Le job part au **prochain réveil**. Pour réveiller le Mac vers 02:55 :

```bash
sudo pmset repeat wakeorpoweron MTWRFSU 02:55:00
```

Voir la planification :

```bash
pmset -g sched
```

Annuler :

```bash
sudo pmset repeat cancel
```

---

## Désinstaller

```bash
launchctl bootout "gui/$(id -u)/com.sdcreativ.caddynote.nightly-push"
rm -f ~/Library/LaunchAgents/com.sdcreativ.caddynote.nightly-push.plist
```

---

## Fichiers du projet

| Fichier | Rôle |
| --- | --- |
| `scripts/nightly-push-main.sh` | Script de push sécurisé |
| `scripts/macos/install-nightly-push-launchagent.sh` | Installation |
| `scripts/macos/com.sdcreativ.caddynote.nightly-push.plist` | Horaire 03:00 |
| `scripts/README.md` | Doc courte dans le dépôt |
