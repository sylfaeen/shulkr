# Configuration

Après l'installation, configure Shulkr pour gérer ton serveur Minecraft.

## Configuration du serveur Minecraft

### Ajouter un serveur

1. Connecte-toi au panel
2. Clique sur **Ajouter un serveur**
3. Renseigne les informations :

| Champ   | Description                        |
| ------- | ---------------------------------- |
| Nom     | Nom d'affichage du serveur         |
| RAM min | Mémoire minimale (ex. `1G`)        |
| RAM max | Mémoire maximale (ex. `4G`)        |
| Port    | Port du serveur (défaut : `25565`) |

Le dossier du serveur est créé automatiquement sous `SERVERS_BASE_PATH`.

### Télécharger PaperMC

Shulkr peut télécharger PaperMC automatiquement :

1. Va dans les **Paramètres** du serveur
2. Section **Gestion du JAR**
3. Sélectionne la version Minecraft
4. Clique sur **Télécharger**

## Variables d'environnement

Toute la configuration se fait via le fichier `.env` à la racine du projet.

### Chemins

| Variable            | Description                              | Défaut                   |
| ------------------- | ---------------------------------------- | ------------------------ |
| `SHULKR_HOME`       | Répertoire de base de toutes les données | `/opt/shulkr`            |
| `SERVERS_BASE_PATH` | Répertoire des serveurs Minecraft        | `$SHULKR_HOME/servers`   |
| `BACKUPS_BASE_PATH` | Répertoire des sauvegardes               | `$SHULKR_HOME/backups`   |
| `DATABASE_PATH`     | Chemin du fichier SQLite                 | `$SHULKR_HOME/shulkr.db` |

### Sécurité

| Variable         | Description                          | Défaut                           |
| ---------------- | ------------------------------------ | -------------------------------- |
| `JWT_SECRET`     | Secret pour les tokens JWT           | Auto-généré au premier démarrage |
| `COOKIE_SECRET`  | Secret pour la signature des cookies | Auto-généré au premier démarrage |
| `SECURE_COOKIES` | Active les cookies sécurisés (HTTPS) | `false`                          |

Les secrets sont générés automatiquement s'ils sont vides et sont écrits dans le `.env` au premier démarrage.

### Arborescence

```
$SHULKR_HOME/
├── app/              # Application du panel
├── servers/          # Serveurs Minecraft
├── backups/          # Sauvegardes automatiques
└── shulkr.db        # Base SQLite
```

## Configuration JVM

### Aikar Flags (recommandé)

Pour de meilleures performances, active les Aikar flags :

```
-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200
-XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC
-XX:+AlwaysPreTouch -XX:G1NewSizePercent=30
-XX:G1MaxNewSizePercent=40 -XX:G1HeapRegionSize=8M
-XX:G1ReservePercent=20 -XX:G1HeapWastePercent=5
-XX:G1MixedGCCountTarget=4 -XX:InitiatingHeapOccupancyPercent=15
-XX:G1MixedGCLiveThresholdPercent=90
-XX:G1RSetUpdatingPauseTimePercent=5 -XX:SurvivorRatio=32
-XX:+PerfDisableSharedMem -XX:MaxTenuringThreshold=1
```

Ces flags sont disponibles depuis les paramètres du serveur.

## Gestion du service

Le script d'installation configure automatiquement un service systemd. Shulkr démarre au boot et redémarre en cas d'échec.

La CLI `shulkr` donne un accès rapide aux opérations courantes :

```bash
shulkr status      # État du service, port, Nginx, URL d'accès
shulkr start       # Démarre le service
shulkr stop        # Arrête le service
shulkr restart     # Redémarre le service
shulkr logs        # Suit les logs en direct (journalctl)
shulkr update      # Met à jour Shulkr vers la dernière version
shulkr domains     # Affiche les domaines Nginx et teste la connectivité
shulkr debug       # Génère un bundle de diagnostic ou inspecte en direct (voir : Dépannage)
shulkr version     # Affiche la version courante
shulkr uninstall   # Supprime Shulkr et tous ses fichiers (garde les paquets)
```

Pour générer un bundle de diagnostic à transmettre au mainteneur, ou inspecter le service en direct, voir la page [Dépannage](./troubleshooting.md).

## Mettre à jour Shulkr

Pour mettre à jour Shulkr vers la dernière version :

```bash
sudo shulkr update
```

L'updater :

1. Affiche la version actuelle et la version cible
2. Arrête le service Shulkr et tous les serveurs Minecraft gérés
3. Télécharge et installe la nouvelle version
4. Redémarre tout automatiquement

**Conservé pendant les mises à jour :**

- Base de données (`$SHULKR_HOME/shulkr.db`)
- Configuration (`.env`, secrets, sessions)
- Serveurs Minecraft (`$SERVERS_BASE_PATH`)
- Sauvegardes (`$BACKUPS_BASE_PATH`)

Pour mettre à jour vers une version spécifique plutôt que la dernière :

```bash
sudo SHULKR_VERSION=0.5.0 shulkr update
```

## Désinstaller Shulkr

Pour supprimer complètement Shulkr de ton système :

```bash
sudo shulkr uninstall
```

Il te sera demandé de taper `DELETE` pour confirmer. La commande peut être annulée à tout moment avant la confirmation.

### Ce qui est supprimé

La désinstallation supprime **uniquement** les fichiers et configurations créés par l'installeur Shulkr :

| Quoi                | Chemin                               | Description                                                     |
| ------------------- | ------------------------------------ | --------------------------------------------------------------- |
| Application         | `$SHULKR_HOME/app/`                  | Code du panel, assets compilés, dépendances                     |
| Base de données     | `$SHULKR_HOME/shulkr.db`             | Comptes utilisateurs, configs serveurs, tâches planifiées       |
| Configuration       | `$SHULKR_HOME/app/.env`              | Secrets, chemins                                                |
| Serveurs Minecraft  | `$SERVERS_BASE_PATH/`                | Tous les fichiers serveurs, mondes, configurations              |
| Sauvegardes         | `$BACKUPS_BASE_PATH/`                | Toutes les sauvegardes automatiques                             |
| Service systemd     | `/etc/systemd/system/shulkr.service` | Fichier d'unité uniquement, systemd lui-même n'est pas touché   |
| Site Nginx          | `/etc/nginx/sites-available/shulkr`  | Config du site Shulkr uniquement, Nginx et autres sites intacts |
| Lien symbolique     | `/etc/nginx/sites-enabled/shulkr`    | Symlink du site activé                                          |
| CLI                 | `/usr/local/bin/shulkr`              | La commande `shulkr`                                            |
| Utilisateur système | `shulkr`                             | L'utilisateur Linux créé à l'installation                       |

Après la suppression de la configuration Nginx, Nginx est rechargé automatiquement s'il tourne.

### Ce qui n'est PAS supprimé

Les paquets système installés en dépendances ne sont **jamais** supprimés :

- **Node.js** et **pnpm**
- **Java** (Adoptium Temurin 21 et 17) ainsi que le dépôt APT/YUM Adoptium
- **Nginx** et toutes les configs de sites non-Shulkr
- **Certbot** et tous les certificats Let's Encrypt

::: danger
Cette action est irréversible. Tous les fichiers de serveurs Minecraft, mondes, sauvegardes et la base de données seront définitivement supprimés. Sauvegarde tout ce que tu veux conserver avant d'exécuter cette commande.
:::

### Ordre d'exécution

1. **Arrêt des serveurs Minecraft**, tue tous les processus Java tournant depuis `$SERVERS_BASE_PATH`
2. **Arrêt du service systemd**, exécute `systemctl stop shulkr` puis `systemctl disable shulkr`
3. **Suppression de l'unité systemd**, supprime `/etc/systemd/system/shulkr.service` et recharge le démon
4. **Suppression de la config Nginx**, supprime les fichiers du site Shulkr et recharge Nginx
5. **Suppression du répertoire d'installation**, supprime `$SHULKR_HOME` et tout son contenu
6. **Suppression de l'utilisateur système**, supprime l'utilisateur Linux `shulkr`
7. **Suppression de la CLI**, supprime `/usr/local/bin/shulkr`

## Étape suivante

[Gestion du serveur](/guide/server-management), démarre et contrôle ton serveur
