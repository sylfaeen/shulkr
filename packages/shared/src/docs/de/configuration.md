# Konfiguration

Nach der Installation konfigurierst du Shulkr, um deinen Minecraft-Server zu verwalten.

## Konfiguration des Minecraft-Servers

### Server hinzufügen

1. Im Panel anmelden
2. Auf **Server hinzufügen** klicken
3. Informationen ausfüllen:

| Feld    | Beschreibung                    |
| ------- | ------------------------------- |
| Name    | Anzeigename des Servers         |
| RAM min | Minimaler Speicher (z. B. `1G`) |
| RAM max | Maximaler Speicher (z. B. `4G`) |
| Port    | Server-Port (Standard: `25565`) |

Das Server-Verzeichnis wird automatisch unter `SERVERS_BASE_PATH` angelegt.

### PaperMC herunterladen

Shulkr kann PaperMC automatisch herunterladen:

1. Gehe zu den **Einstellungen** des Servers
2. Bereich **JAR-Verwaltung**
3. Wähle die Minecraft-Version
4. Klicke auf **Herunterladen**

## Umgebungsvariablen

Die gesamte Konfiguration erfolgt über die `.env`-Datei im Projekt-Root.

### Pfade

| Variable            | Beschreibung                        | Standard                 |
| ------------------- | ----------------------------------- | ------------------------ |
| `SHULKR_HOME`       | Basisverzeichnis aller Shulkr-Daten | `/opt/shulkr`            |
| `SERVERS_BASE_PATH` | Verzeichnis der Minecraft-Server    | `$SHULKR_HOME/servers`   |
| `BACKUPS_BASE_PATH` | Verzeichnis der Backups             | `$SHULKR_HOME/backups`   |
| `DATABASE_PATH`     | Pfad zur SQLite-Datenbankdatei      | `$SHULKR_HOME/shulkr.db` |

### Sicherheit

| Variable         | Beschreibung                          | Standard                      |
| ---------------- | ------------------------------------- | ----------------------------- |
| `JWT_SECRET`     | Geheimnis für JWT-Tokens              | Beim ersten Start automatisch |
| `COOKIE_SECRET`  | Geheimnis für die Cookie-Signierung   | Beim ersten Start automatisch |
| `SECURE_COOKIES` | Aktiviert sichere Cookies (nur HTTPS) | `false`                       |

Geheimnisse werden automatisch erzeugt, wenn sie leer bleiben, und beim ersten Start in die `.env` zurückgeschrieben.

### Verzeichnisstruktur

```
$SHULKR_HOME/
├── app/              # Panel-Anwendung
├── servers/          # Minecraft-Server
├── backups/          # Automatische Backups
└── shulkr.db        # SQLite-Datenbank
```

## JVM-Konfiguration

### Aikar Flags (empfohlen)

Für bessere Performance aktiviere die Aikar Flags:

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

Diese Flags sind in den Server-Einstellungen verfügbar.

## Service-Verwaltung

Das Installationsskript richtet automatisch einen systemd-Dienst ein. Shulkr startet beim Booten und neu bei einem Fehler.

Die `shulkr` CLI bietet schnellen Zugriff auf gängige Operationen:

```bash
shulkr status      # Status, Port, Nginx und Zugriffs-URL
shulkr start       # Dienst starten
shulkr stop        # Dienst stoppen
shulkr restart     # Dienst neu starten
shulkr logs        # Live-Logs verfolgen (journalctl)
shulkr update      # Shulkr auf die neueste Version aktualisieren
shulkr domains     # Nginx-Domains anzeigen und Verbindung prüfen
shulkr debug       # Diagnose-Bundle erstellen oder live inspizieren (siehe: Fehlerbehebung)
shulkr version     # Aktuelle Version anzeigen
shulkr uninstall   # Shulkr und alle Dateien entfernen (Pakete bleiben)
```

Um einen Diagnose-Snapshot für den Maintainer zu erzeugen oder den Dienst live zu inspizieren, siehe Seite [Fehlerbehebung](./troubleshooting.md).

## Shulkr aktualisieren

Um Shulkr auf die neueste Version zu aktualisieren:

```bash
sudo shulkr update
```

Der Updater:

1. Zeigt aktuelle und Zielversion
2. Stoppt den Shulkr-Dienst und alle verwalteten Minecraft-Server
3. Lädt die neue Version herunter und installiert sie
4. Startet alles automatisch neu

**Bei Updates erhalten:**

- Datenbank (`$SHULKR_HOME/shulkr.db`)
- Konfiguration (`.env`, Geheimnisse, Sessions)
- Minecraft-Server (`$SERVERS_BASE_PATH`)
- Backups (`$BACKUPS_BASE_PATH`)

Um auf eine bestimmte Version statt der neuesten zu aktualisieren:

```bash
sudo SHULKR_VERSION=0.5.0 shulkr update
```

## Shulkr deinstallieren

Um Shulkr vollständig vom System zu entfernen:

```bash
sudo shulkr uninstall
```

Du wirst aufgefordert, `DELETE` zur Bestätigung einzugeben. Der Befehl kann jederzeit vor der Bestätigung abgebrochen werden.

### Was entfernt wird

Die Deinstallation entfernt **nur** Dateien und Konfigurationen, die der Shulkr-Installer angelegt hat:

| Was              | Pfad                                 | Beschreibung                                             |
| ---------------- | ------------------------------------ | -------------------------------------------------------- |
| Anwendung        | `$SHULKR_HOME/app/`                  | Panel-Code, gebaute Assets, Abhängigkeiten               |
| Datenbank        | `$SHULKR_HOME/shulkr.db`             | Benutzerkonten, Server-Konfigs, geplante Aufgaben        |
| Konfiguration    | `$SHULKR_HOME/app/.env`              | Geheimnisse, Pfade                                       |
| Minecraft-Server | `$SERVERS_BASE_PATH/`                | Alle Server-Dateien, Welten, Konfigurationen             |
| Backups          | `$BACKUPS_BASE_PATH/`                | Alle automatischen Backups                               |
| systemd-Dienst   | `/etc/systemd/system/shulkr.service` | Nur Unit-Datei, systemd selbst bleibt unberührt          |
| Nginx-Site       | `/etc/nginx/sites-available/shulkr`  | Nur Shulkr-Site-Konfig, Nginx und andere Sites unberührt |
| Nginx-Symlink    | `/etc/nginx/sites-enabled/shulkr`    | Symlink der aktivierten Site                             |
| CLI              | `/usr/local/bin/shulkr`              | Der `shulkr`-Befehl                                      |
| System-Benutzer  | `shulkr`                             | Der bei der Installation angelegte Linux-Benutzer        |

Nach dem Entfernen der Nginx-Konfiguration wird Nginx automatisch neu geladen, falls es läuft.

### Was NICHT entfernt wird

System-Pakete, die als Abhängigkeiten installiert wurden, werden **nie** entfernt:

- **Node.js** und **pnpm**
- **Java** (Adoptium Temurin 21 und 17) sowie das Adoptium APT/YUM-Repository
- **Nginx** und alle nicht-Shulkr Site-Konfigurationen
- **Certbot** und alle Let's-Encrypt-Zertifikate

::: danger
Diese Aktion ist unwiderruflich. Alle Minecraft-Server-Dateien, Welten, Backups und die Datenbank werden dauerhaft gelöscht. Sichere alles, was du behalten willst, vor Ausführung dieses Befehls.
:::

### Ausführungsreihenfolge

1. **Minecraft-Server stoppen**, beendet alle Java-Prozesse aus `$SERVERS_BASE_PATH`
2. **systemd-Dienst stoppen**, führt `systemctl stop shulkr` und `systemctl disable shulkr` aus
3. **systemd-Unit entfernen**, löscht `/etc/systemd/system/shulkr.service` und lädt den Daemon neu
4. **Nginx-Konfig entfernen**, löscht die Shulkr-Site-Dateien und lädt Nginx neu
5. **Installationsverzeichnis entfernen**, löscht `$SHULKR_HOME` und alles darin
6. **System-Benutzer entfernen**, löscht den Linux-Benutzer `shulkr`
7. **CLI entfernen**, löscht `/usr/local/bin/shulkr`

## Nächster Schritt

[Server-Verwaltung](/guide/server-management), starte und steuere deinen Server
