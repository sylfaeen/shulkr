# Installation

Shulkr lässt sich je nach Umgebung auf mehrere Arten installieren.

## Schnellinstallation (Linux)

Die empfohlene Methode für einen Produktionsserver:

```bash
curl -fsSL https://raw.githubusercontent.com/sylfaeen/shulkr/main/install.sh | sudo bash
```

Prüfe, dass alles läuft:

```bash
shulkr status
```

## Systemvoraussetzungen

Shulkr benötigt **Debian 12+** (empfohlen) oder eine beliebige systemd-basierte Linux-Distribution. Es läuft nativ auf dem Host, ohne Containerisierung.

::: warning Docker nicht unterstützt
Shulkr wurde nicht für Docker getestet oder optimiert. Der Betrieb in einem Docker-Container wird nicht empfohlen und kann Probleme mit der Server-Prozessverwaltung, SFTP und systemd-Integration verursachen.
:::

## Nächster Schritt

[Konfiguration](/guide/configuration), konfiguriere deinen ersten Minecraft-Server
