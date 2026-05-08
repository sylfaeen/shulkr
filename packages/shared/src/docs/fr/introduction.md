# Introduction

Shulkr est un panel de gestion léger et moderne pour serveurs Minecraft. Il permet de contrôler ton serveur depuis une interface web intuitive.

## Fonctionnalités principales

- **Console temps réel**, voir les logs et envoyer des commandes
- **Gestion des fichiers**, éditeur Monaco intégré pour modifier les configurations
- **Plugins**, upload et gestion en glisser-déposer
- **Tâches planifiées**, redémarrages et sauvegardes automatiques
- **Monitoring**, CPU, RAM et joueurs en temps réel
- **Multi-utilisateurs**, permissions granulaires par utilisateur

## Stack technique

Shulkr repose sur des technologies modernes :

| Composant  | Technologie                 |
| ---------- | --------------------------- |
| Backend    | Fastify + ts-rest + SQLite  |
| Frontend   | React + Vite + Tailwind CSS |
| Temps réel | WebSocket (natif)           |
| Base       | SQLite + Drizzle ORM        |

## Prérequis

- **Node.js** 20 LTS ou supérieur
- **pnpm** (gestionnaire de paquets)
- **Linux** en production (macOS pour le développement)

## Étape suivante

1. [Installation](/guide/installation)
