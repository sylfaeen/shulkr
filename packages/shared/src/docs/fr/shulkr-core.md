# Plugin Shulkr Core

`shulkr-core` est le plugin compagnon optionnel installé sur ton serveur Minecraft. Son seul rôle est de pousser une **télémétrie temps réel vérifiée** au panel shulkr, afin que les pages Analytics, Joueurs et Performance affichent des données précises et fiables.

## Règle de parité

Shulkr fonctionne de la même manière que le plugin soit installé ou non. Le plugin est **purement additif** : il ne remplace aucun mécanisme du panel. Sans lui, shulkr s'appuie sur ce qu'il peut observer depuis l'hôte (métriques processus, RCON, query, parsing des logs). Avec lui, les mêmes écrans deviennent plus précis et plus riches car les données proviennent directement du serveur en cours d'exécution.

## Plateformes supportées

| Plateforme | Statut   | Notes                                               |
| ---------- | -------- | --------------------------------------------------- |
| Paper      | Supporté | Runtime recommandé                                  |
| Folia      | Supporté | Même JAR que Paper, schedulers régionaux gérés      |
| Velocity   | Supporté | Mode proxy, remonte les backends au lieu des mondes |
| Waterfall  | Supporté | Mode proxy, remonte les backends au lieu des mondes |

Le plugin auto-détecte la plateforme au démarrage et adapte ce qu'il collecte.

## Ce que le plugin remonte

Un snapshot est collecté à intervalle fixe et envoyé en POST au backend shulkr. Chaque snapshot contient :

### Santé du serveur

- **TPS** (ticks par seconde), fenêtres 5s, 1m, 15m
- **MSPT** (millisecondes par tick) moyen
- **Mémoire** : utilisée, max, heap utilisé, heap max, non-heap utilisé
- **Uptime** depuis le chargement du plugin

### Joueurs (Paper / Folia)

Pour chaque joueur connecté :

- UUID et pseudo
- Monde courant
- Ping (ms)
- Vie et niveau de faim
- Position X, Y, Z
- Flag op

### Mondes (Paper / Folia)

Pour chaque monde chargé :

- Nom
- Nombre d'entités
- Nombre de chunks chargés
- Nombre de joueurs

### Backends proxy (Velocity / Waterfall)

Pour chaque serveur backend enregistré :

- Nom du backend
- Nombre de joueurs en ligne
- Flag d'accessibilité

### Métadonnées

- Version du plugin et version du protocole
- Nom et version de la plateforme
- Horodatage de collecte (ISO 8601)

::: info
Le plugin **ne lit pas et ne transmet pas** les messages de chat, l'historique des commandes, les inventaires, les fichiers du monde, ni quoi que ce soit en dehors du snapshot listé ci-dessus.
:::

## Installation

L'installation se fait depuis le panel, aucune copie de fichier ni gestion de token manuelle n'est nécessaire. Le plugin se présente sous la forme d'un bloc dédié sur la page **JAR, Java & JVM** de ton serveur.

### Étape par étape

1. Ouvre ton serveur dans le panel et va dans **Paramètres → JAR, Java & JVM**.
2. Descends jusqu'au bloc **Plugin shulkr-core**. Si le plugin n'est pas encore installé, tu verras "Plugin optionnel, non installé" avec une courte description.
3. Clique sur **Installer le plugin**. Une boîte de dialogue s'ouvre pour demander la plateforme de ce serveur.
4. Sélectionne la bonne plateforme (Paper, Folia, Velocity ou Waterfall). La boîte de dialogue affiche les versions Minecraft supportées pour chacune.
5. Confirme. Le panel écrit le bon JAR dans `plugins/` et génère `plugins/shulkr-core/config.yml` avec un `server_id` et un `token` frais. Aucun fichier à éditer à la main.
6. Redémarre le serveur. Le bloc te le rappelle et passe à "En attente du premier ping" jusqu'à ce que le plugin se connecte.

Une fois connecté, le bloc affiche le statut du plugin (Connecté, Déconnecté, Obsolète), la version, le dernier horodatage de connexion, et les valeurs live de `config.yml` lues sur le disque.

### Autres actions du même bloc

- **Réinstaller** réécrit le JAR et `config.yml` (même token), utile après une mise à jour panel qui a bumpé la version embarquée du plugin.
- **Mettre à jour** apparaît quand le plugin en cours d'exécution est plus ancien que celui livré avec shulkr.
- **Régénérer le token** invalide l'ancien token et en écrit un nouveau. Le plugin doit être réinstallé ou `config.yml` réappliqué pour que le nouveau token prenne effet.
- **Désactiver / Réactiver** stoppe la prise en charge des push par le backend pour ce serveur, sans toucher aux fichiers sur l'hôte Minecraft.

::: info
Le bouton Installer est le seul chemin d'installation supporté. Le panel gère ensemble la version du JAR, le fichier de config et le token d'authentification, comme une unité. Éditer `plugins/shulkr-core/config.yml` à la main est OK pour inspection, mais une **Réinstallation** depuis le panel l'écrasera.
:::

## Configuration

| Clé                     | Défaut                  | Description                                       |
| ----------------------- | ----------------------- | ------------------------------------------------- |
| `backend_url`           | `http://127.0.0.1:3001` | Où le plugin pousse les snapshots                 |
| `server_id`             | (défini par le panel)   | Identifiant de ce serveur dans shulkr             |
| `token`                 | (défini par le panel)   | Token d'authentification, à ne jamais partager    |
| `push_interval_seconds` | `5`                     | Fréquence d'envoi des snapshots                   |
| `protocol_version`      | `1`                     | Protocole, ne pas modifier sauf demande de shulkr |

::: warning
Le token authentifie ce serveur auprès de ton backend shulkr. Traite-le comme un mot de passe. Ne commit pas `config.yml` dans un dépôt public.
:::

## Commandes

À exécuter en console ou en jeu (nécessite `shulkr.admin`, défaut : op) :

| Commande         | Effet                                                                         |
| ---------------- | ----------------------------------------------------------------------------- |
| `/shulkr status` | Affiche la version du plugin, l'URL du backend, le server id, le dernier push |
| `/shulkr reload` | Recharge `config.yml` sans redémarrer le serveur                              |

## Permissions

| Nœud           | Défaut | Description                            |
| -------------- | ------ | -------------------------------------- |
| `shulkr.admin` | op     | Exécuter les commandes admin `/shulkr` |

## Comment le panel utilise les données

| Page du panel            | Avec le plugin                                  | Sans le plugin                                             |
| ------------------------ | ----------------------------------------------- | ---------------------------------------------------------- |
| Joueurs (liste en ligne) | UUID, ping, position et vie en direct           | Pseudos parsés depuis les logs, pas de ping ni de position |
| Performance / Analytics  | TPS, MSPT et heap réels depuis la JVM           | Métriques CPU et mémoire au niveau du processus uniquement |
| Mondes                   | Nombre d'entités et de chunks chargés           | Non disponible                                             |
| Vue proxy                | Accessibilité des backends et nombre de joueurs | Non disponible                                             |
