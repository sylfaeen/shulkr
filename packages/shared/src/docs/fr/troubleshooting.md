# Dépannage

Quand Shulkr se comporte de façon inattendue, la CLI `shulkr debug` collecte tout ce dont un mainteneur a besoin pour comprendre ce qui s'est passé, en une seule commande.

## Deux modes, une seule commande

### Mode bundle (par défaut)

Génère un tarball à envoyer au mainteneur :

```bash
sudo shulkr debug
```

Produit `/tmp/shulkr-debug-<timestamp>.tar.gz`. Pas de plafond de taille.

### Mode console (inspection live)

Inspecte une section précise directement dans le terminal :

```bash
shulkr debug summary         # Vue d'ensemble en une page
shulkr debug tasks           # Exécutions de tâches (24 dernières heures)
shulkr debug errors          # Entrées ERROR / WARN récentes
shulkr debug server <id>     # Logs et crash reports d'un serveur
shulkr debug db              # Compteurs DB, schéma et anomalies détectées
```

Ajoute `--since 1h` ou `--since 2026-04-20` pour restreindre la fenêtre temporelle (défaut : 24h).

## Contenu du bundle

```text
shulkr-debug-<ts>/
├── meta.txt                # Version Shulkr, Java, Node, OS
├── systemd/
│   ├── status.txt          # systemctl status shulkr
│   └── journal.txt         # 2000 dernières entrées du journal (rédigées)
├── nginx/
│   ├── status.txt
│   └── config.txt          # /etc/nginx/sites-available/shulkr
├── db/
│   ├── schema.sql
│   ├── servers.csv         # Colonnes en liste blanche uniquement
│   ├── scheduled_tasks.csv
│   ├── task_executions.csv # 24 dernières heures
│   └── counts.txt
├── servers/
│   └── <id>/
│       ├── latest.log      # 500 dernières lignes (rédigées)
│       └── crash-reports/
├── disk.txt                # df -h
└── MANIFEST.txt
```

## Sécurité, ce qui n'est jamais collecté

Les secrets sont **exclus à la source** : ils ne sont pas rédigés, ils ne sont tout simplement jamais lus. Tu peux auditer la sortie en confiance avant de l'envoyer.

**Jamais inclus :**

- Le fichier `.env` et ses valeurs (`JWT_SECRET`, `COOKIE_SECRET`, `DATABASE_URL`, etc.)
- Clés privées et certificats (`*.key`, `*.pem`, `*.crt`)
- Hashs de mots de passe utilisateurs
- Mots de passe RCON
- URLs de webhooks, JWTs, clés API, identifiants S3 / R2 / B2
- Clés SSH (`~/.ssh/`, `/root/.ssh/`)
- Matériel Let's Encrypt (`/etc/letsencrypt/`)

**Patterns de rédaction appliqués au texte des logs :**

- Adresses IPv4 et IPv6 → `X.X.X.X` / `X:X:X:X` (loopback préservée)
- Adresses email → `<email>`
- JWTs (`eyJ...`) → `<jwt>`
- Tokens (`sk_...`, `pk_...`) → `<token>`
- Paramètres de query d'URL (`?token=`, `?key=`, `?secret=`, `?password=`, `?api_key=`) → `?<param>=<redacted>`

Une vérification de non-régression tourne à la fin de chaque génération de bundle. Si un pattern sensible passe au travers, l'archive est jetée et une erreur est affichée.

## Envoyer le bundle au mainteneur

1. Génère le bundle : `sudo shulkr debug`
2. Lis le chemin affiché à la fin, par exemple `/tmp/shulkr-debug-20260420-143022.tar.gz`
3. Sors le fichier (il appartient à `root` avec mode `600`) :

```bash
sudo cp /tmp/shulkr-debug-<ts>.tar.gz /home/<toi>/
sudo chown <toi>:<toi> /home/<toi>/shulkr-debug-<ts>.tar.gz
scp /home/<toi>/shulkr-debug-<ts>.tar.gz toi@local:/tmp/
```

4. Joins-le à ton rapport de bug.

## Quoi utiliser et quand

- **Le service est down, tu n'as aucune idée pourquoi.** Lance `sudo shulkr debug` et envoie le bundle.
- **Les tâches planifiées semblent échouer.** Lance `shulkr debug tasks` pour voir les 24 dernières heures dans un tableau. Si une tâche se distingue, inspecte plus loin avec `shulkr debug errors`.
- **Un serveur dysfonctionne.** Lance `shulkr debug server <id>`, ça affiche les 100 dernières lignes de `latest.log` et liste les crash reports.
- **Tu veux un check de santé avant de remonter quoi que ce soit.** Lance `shulkr debug summary`. Il signale les problèmes évidents.
- **Tu suspectes des incohérences en base.** Lance `shulkr debug db`, il détecte les tâches planifiées orphelines, les exécutions bloquées en `in_progress`, et les serveurs marqués running sans processus correspondant.

## La commande nécessite sudo

La génération du bundle lit le journal systemd et écrit dans `/tmp` avec des permissions restreintes. Si tu oublies `sudo` :

```text
Debug requires root, retry with: sudo shulkr debug
```

Les sous-commandes console (`summary`, `tasks`, `errors`, `server`, `db`) qui ne lisent que la DB peuvent tourner sans sudo si le fichier DB est lisible, sinon utilise `sudo shulkr debug <sous-commande>`.
