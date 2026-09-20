# Fehlerbehebung

Wenn Shulkr sich unerwartet verhält, sammelt die `shulkr debug` CLI in einem einzigen Befehl alles, was ein Maintainer zur Analyse braucht.

## Zwei Modi, ein Befehl

### Bundle-Modus (Standard)

Erzeugt ein Tarball, das du an den Maintainer schicken kannst:

```bash
sudo shulkr debug
```

Erzeugt `/tmp/shulkr-debug-<timestamp>.tar.gz`. Keine Größenbegrenzung.

### Konsolen-Modus (Live-Inspektion)

Inspiziere einen bestimmten Bereich direkt im Terminal:

```bash
shulkr debug summary         # Übersicht auf einer Seite
shulkr debug tasks           # Aufgabenausführungen (letzte 24h)
shulkr debug errors          # Aktuelle ERROR / WARN-Einträge
shulkr debug server <id>     # Logs und Crash-Reports eines Servers
shulkr debug db              # DB-Zähler, Schema und erkannte Anomalien
```

Füge `--since 1h` oder `--since 2026-04-20` hinzu, um den Zeitraum einzuschränken (Standard: 24h).

## Inhalt des Bundles

```text
shulkr-debug-<ts>/
├── meta.txt                # Shulkr-Version, Java, Node, OS
├── systemd/
│   ├── status.txt          # systemctl status shulkr
│   └── journal.txt         # Letzte 2000 Journal-Einträge (redigiert)
├── nginx/
│   ├── status.txt
│   └── config.txt          # /etc/nginx/sites-available/shulkr
├── db/
│   ├── schema.sql
│   ├── servers.csv         # Nur Whitelist-Spalten
│   ├── scheduled_tasks.csv
│   ├── task_executions.csv # Letzte 24h
│   └── counts.txt
├── servers/
│   └── <id>/
│       ├── latest.log      # Letzte 500 Zeilen (redigiert)
│       └── crash-reports/
├── disk.txt                # df -h
└── MANIFEST.txt
```

## Sicherheit, was nie gesammelt wird

Geheimnisse werden **an der Quelle ausgeschlossen**: sie werden nicht redigiert, sondern schlicht nie gelesen. Du kannst die Ausgabe vor dem Versand mit Vertrauen prüfen.

**Niemals enthalten:**

- Die `.env`-Datei und ihre Werte (`JWT_SECRET`, `COOKIE_SECRET`, `DATABASE_URL`, etc.)
- Private Schlüssel und Zertifikate (`*.key`, `*.pem`, `*.crt`)
- Passwort-Hashes von Benutzern
- RCON-Passwörter
- Webhook-URLs, JWTs, API-Keys, S3-/R2-/B2-Credentials
- SSH-Schlüssel (`~/.ssh/`, `/root/.ssh/`)
- Let's-Encrypt-Material (`/etc/letsencrypt/`)

**Auf Logs angewandte Redaktionsmuster:**

- IPv4- und IPv6-Adressen → `X.X.X.X` / `X:X:X:X` (Loopback bleibt)
- E-Mail-Adressen → `<email>`
- JWTs (`eyJ...`) → `<jwt>`
- Tokens (`sk_...`, `pk_...`) → `<token>`
- URL-Query-Parameter (`?token=`, `?key=`, `?secret=`, `?password=`, `?api_key=`) → `?<param>=<redacted>`

Am Ende jeder Bundle-Erzeugung läuft eine Non-Regression-Prüfung. Falls ein sensibles Muster durchrutscht, wird das Archiv verworfen und ein Fehler angezeigt.

## Bundle an den Maintainer senden

1. Bundle erzeugen: `sudo shulkr debug`
2. Lies den am Ende angezeigten Pfad, z. B. `/tmp/shulkr-debug-20260420-143022.tar.gz`
3. Übertrage die Datei (sie gehört `root` mit Modus `600`):

```bash
sudo cp /tmp/shulkr-debug-<ts>.tar.gz /home/<du>/
sudo chown <du>:<du> /home/<du>/shulkr-debug-<ts>.tar.gz
scp /home/<du>/shulkr-debug-<ts>.tar.gz du@local:/tmp/
```

4. Hänge sie an deinen Bug-Report.

## Was wann verwenden

- **Dienst ist down, du weißt nicht warum.** Führe `sudo shulkr debug` aus und schicke das Bundle.
- **Geplante Aufgaben scheinen zu scheitern.** Führe `shulkr debug tasks` aus, um die letzten 24h tabellarisch zu sehen. Sticht eine heraus, mit `shulkr debug errors` weiter prüfen.
- **Ein Server verhält sich seltsam.** Führe `shulkr debug server <id>` aus, das zeigt die letzten 100 Zeilen von `latest.log` und listet Crash-Reports auf.
- **Du willst einen Health-Check vor der Meldung.** Führe `shulkr debug summary` aus. Es markiert die offensichtlichen Probleme.
- **Du vermutest DB-Inkonsistenzen.** Führe `shulkr debug db` aus, es erkennt verwaiste geplante Aufgaben, in `in_progress` hängende Ausführungen und als running markierte Server ohne passenden Prozess.

## Befehl benötigt sudo

Die Bundle-Erstellung liest das systemd-Journal und schreibt mit eingeschränkten Rechten nach `/tmp`. Wenn du `sudo` vergisst:

```text
Debug requires root, retry with: sudo shulkr debug
```

Konsolen-Subbefehle (`summary`, `tasks`, `errors`, `server`, `db`), die nur die DB lesen, können ohne sudo laufen, wenn die DB-Datei lesbar ist, sonst `sudo shulkr debug <subbefehl>`.
