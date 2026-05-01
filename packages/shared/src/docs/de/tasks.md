# Geplante Aufgaben

Automatisiere die Wartungsaufgaben deines Servers.

## Aufgabentypen

### Automatischer Neustart

Periodischer Server-Neustart, um:

- Speicher freizugeben
- Plugin-Updates anzuwenden
- Performance zu erhalten

### Automatisches Backup

Backup des `world`-Ordners:

- Komprimiert als `.zip`
- Automatischer Zeitstempel
- Konfigurierbarer Speicherort

## Cron-Ausdrücke

Format: `Minute Stunde Tag Monat Wochentag`

### Häufige Beispiele

| Ausdruck      | Beschreibung                     |
| ------------- | -------------------------------- |
| `0 4 * * *`   | Täglich um 4:00 Uhr              |
| `0 */6 * * *` | Alle 6 Stunden                   |
| `30 3 * * 0`  | Sonntag um 3:30 Uhr              |
| `0 0 1 * *`   | Erster des Monats um Mitternacht |
