# Einführung

Shulkr ist ein leichtgewichtiges, modernes Verwaltungspanel für Minecraft-Server. Es erlaubt dir, deinen Server über eine intuitive Web-Oberfläche zu steuern.

## Hauptfunktionen

- **Echtzeit-Konsole**, Logs ansehen und Befehle senden
- **Dateiverwaltung**, integrierter Monaco-Editor zum Bearbeiten von Konfigurationen
- **Plugins**, hochladen und verwalten per Drag & Drop
- **Geplante Aufgaben**, automatische Neustarts und Backups
- **Monitoring**, CPU, RAM und Spieler in Echtzeit
- **Mehrbenutzer**, granulare Berechtigungen pro Benutzer

## Tech-Stack

Shulkr ist mit modernen Technologien gebaut:

| Komponente | Technologie                 |
| ---------- | --------------------------- |
| Backend    | Fastify + ts-rest + SQLite  |
| Frontend   | React + Vite + Tailwind CSS |
| Echtzeit   | WebSocket (nativ)           |
| Datenbank  | SQLite + Drizzle ORM        |

## Voraussetzungen

- **Node.js** 20 LTS oder höher
- **pnpm** (Paketmanager)
- **Linux** für Produktion (macOS für Entwicklung)

## Nächster Schritt

1. [Installation](/guide/installation)
