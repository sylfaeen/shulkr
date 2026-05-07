# Shulkr-Core-Plugin

`shulkr-core` ist das optionale Begleitplugin, das auf deinem Minecraft-Server installiert wird. Seine einzige Aufgabe ist es, **verifizierte Echtzeit-Telemetrie** an das Shulkr-Panel zu liefern, damit die Seiten Analytics, Spieler und Performance präzise, verlässliche Daten anzeigen können.

## Paritätsregel

Shulkr verhält sich gleich, ob das Plugin installiert ist oder nicht. Das Plugin ist **rein additiv**: es ersetzt nie einen Mechanismus des Panels. Ohne es greift Shulkr auf das zurück, was es vom Host beobachten kann (Prozess-Metriken, RCON, Query, Log-Parsing). Mit ihm werden dieselben Bildschirme genauer und reichhaltiger, weil die Daten direkt vom laufenden Server kommen.

## Unterstützte Plattformen

| Plattform | Status      | Hinweise                                                   |
| --------- | ----------- | ---------------------------------------------------------- |
| Paper     | Unterstützt | Empfohlene Runtime                                         |
| Folia     | Unterstützt | Selbes JAR wie Paper, regionale Scheduler werden behandelt |
| Velocity  | Unterstützt | Proxy-Modus, meldet Backends statt Welten                  |
| Waterfall | Unterstützt | Proxy-Modus, meldet Backends statt Welten                  |

Das Plugin erkennt die Plattform beim Start automatisch und passt die gesammelten Daten entsprechend an.

## Was das Plugin sendet

In festem Intervall wird ein Snapshot gesammelt und per POST an das Shulkr-Backend geschickt. Jeder Snapshot enthält:

### Servergesundheit

- **TPS** (Ticks pro Sekunde), Fenster 5s, 1m, 15m
- **MSPT** (Millisekunden pro Tick), Durchschnitt
- **Speicher**: benutzt, max, Heap benutzt, Heap max, Non-Heap benutzt
- **Uptime** seit Plugin-Ladezeit

### Spieler (Paper / Folia)

Für jeden verbundenen Spieler:

- UUID und Benutzername
- Aktuelle Welt
- Ping (ms)
- Leben und Sättigung
- Position X, Y, Z
- Op-Flag

### Welten (Paper / Folia)

Für jede geladene Welt:

- Name
- Anzahl Entitäten
- Anzahl geladener Chunks
- Anzahl Spieler

### Proxy-Backends (Velocity / Waterfall)

Für jeden registrierten Backend-Server:

- Backend-Name
- Online-Spieler
- Erreichbarkeits-Flag

### Metadaten

- Plugin- und Protokollversion
- Plattformname und -version
- Zeitstempel der Erfassung (ISO 8601)

::: info
Das Plugin **liest und überträgt keine** Chat-Nachrichten, keine Befehlshistorie, keine Inventare, keine Welt-Dateien und nichts außerhalb des oben aufgelisteten Snapshots.
:::

## Installation

Die Installation erfolgt vollständig über das Panel, kein manuelles Kopieren von Dateien oder Token-Handling nötig. Das Plugin erscheint als eigener Block auf der Seite **JAR, Java & JVM** deines Servers.

### Schritt für Schritt

1. Öffne deinen Server im Panel und gehe zu **Einstellungen → JAR, Java & JVM**.
2. Scrolle zum Block **shulkr-core-Plugin**. Falls das Plugin noch nicht installiert ist, siehst du "Optionales Plugin, nicht installiert" mit einer kurzen Beschreibung.
3. Klicke auf **Plugin installieren**. Es öffnet sich ein Dialog, der nach der Plattform dieses Servers fragt.
4. Wähle die passende Plattform (Paper, Folia, Velocity oder Waterfall). Der Dialog zeigt die unterstützten Minecraft-Versionen für jede.
5. Bestätige. Das Panel schreibt das passende JAR nach `plugins/` und erzeugt `plugins/shulkr-core/config.yml` mit frischer `server_id` und `token`. Keine Datei zum manuellen Bearbeiten.
6. Starte den Server neu. Der Block weist dich darauf hin und wechselt auf "Wartet auf ersten Ping", bis das Plugin sich verbindet.

Nach dem Verbinden zeigt der Block den Plugin-Status (Verbunden, Getrennt, Veraltet), die Version, den letzten Verbindungs-Zeitstempel und die Live-Werte aus `config.yml` von der Festplatte.

### Weitere Aktionen im selben Block

- **Neu installieren** schreibt JAR und `config.yml` neu (gleicher Token), nützlich nach einem Panel-Update, das die mitgelieferte Plugin-Version erhöht hat.
- **Aktualisieren** erscheint, wenn das laufende Plugin älter ist als das mit Shulkr ausgelieferte.
- **Token regenerieren** macht den alten Token ungültig und schreibt einen neuen. Das Plugin muss neu installiert werden oder `config.yml` neu angewendet werden, damit der neue Token greift.
- **Deaktivieren / Wieder aktivieren** stoppt das Annehmen von Pushes für diesen Server im Backend, ohne die Dateien auf dem Minecraft-Host anzufassen.

::: info
Der Installieren-Button ist der einzige unterstützte Installationsweg. Das Panel verwaltet JAR-Version, Konfigurationsdatei und Auth-Token zusammen als eine Einheit. `plugins/shulkr-core/config.yml` von Hand zu öffnen ist zur Inspektion in Ordnung, eine **Neuinstallation** aus dem Panel überschreibt sie aber.
:::

## Konfiguration

| Schlüssel               | Standard                | Beschreibung                                  |
| ----------------------- | ----------------------- | --------------------------------------------- |
| `backend_url`           | `http://127.0.0.1:3001` | Wohin das Plugin Snapshots sendet             |
| `server_id`             | (vom Panel gesetzt)     | Identifier dieses Servers in Shulkr           |
| `token`                 | (vom Panel gesetzt)     | Auth-Token, niemals weitergeben               |
| `push_interval_seconds` | `5`                     | Wie oft ein Snapshot gesendet wird            |
| `protocol_version`      | `1`                     | Protokoll, nur ändern wenn Shulkr es verlangt |

::: warning
Der Token authentifiziert diesen Server gegenüber deinem Shulkr-Backend. Behandle ihn wie ein Passwort. Committe `config.yml` nicht in ein öffentliches Repository.
:::

## Befehle

Aus der Konsole oder im Spiel ausführen (benötigt `shulkr.admin`, Standard: op):

| Befehl           | Wirkung                                                                |
| ---------------- | ---------------------------------------------------------------------- |
| `/shulkr status` | Zeigt Plugin-Version, Backend-URL, Server-ID, letzten Push-Zeitstempel |
| `/shulkr reload` | Lädt `config.yml` neu, ohne den Server neu zu starten                  |

## Berechtigungen

| Knoten         | Standard | Beschreibung                          |
| -------------- | -------- | ------------------------------------- |
| `shulkr.admin` | op       | Die `/shulkr`-Admin-Befehle ausführen |

## Wie das Panel die Daten verwendet

| Panel-Seite             | Mit Plugin                                  | Ohne Plugin                                          |
| ----------------------- | ------------------------------------------- | ---------------------------------------------------- |
| Spieler (Online-Liste)  | UUIDs, Ping, Position und Leben in Echtzeit | Namen aus Logs geparst, kein Ping und keine Position |
| Performance / Analytics | Echte TPS, MSPT, Heap aus der JVM           | Nur prozessbezogene CPU- und Speicher-Metriken       |
| Welten                  | Entitäten- und geladene-Chunks-Zähler       | Nicht verfügbar                                      |
| Proxy-Ansicht           | Backend-Erreichbarkeit und Spielerzahlen    | Nicht verfügbar                                      |
