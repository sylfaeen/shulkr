# Installation

Shulkr peut être installé de plusieurs façons selon ton environnement.

## Installation rapide (Linux)

La méthode recommandée pour un serveur de production :

```bash
curl -fsSL https://raw.githubusercontent.com/sylfaeen/shulkr/main/install.sh | sudo bash
```

Vérifie que tout fonctionne :

```bash
shulkr status
```

## Pré-requis système

Shulkr nécessite **Debian 12+** (recommandé) ou toute distribution Linux basée sur systemd. Il s'exécute nativement sur l'hôte, sans conteneurisation.

::: warning Docker non supporté
Shulkr n'a pas été testé ni optimisé pour Docker. L'exécuter dans un conteneur Docker n'est pas recommandé et peut poser problème avec la gestion des processus serveurs, le SFTP et l'intégration systemd.
:::

## Étape suivante

[Configuration](/guide/configuration), configure ton premier serveur Minecraft
