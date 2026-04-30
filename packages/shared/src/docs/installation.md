# Installation

Shulkr can be installed in several ways depending on your environment.

## Quick Install (Linux)

The recommended method for a production server:

```bash
curl -fsSL https://raw.githubusercontent.com/sylfaeen/shulkr/main/install.sh | sudo bash
```

Verify that everything is running:

```bash
shulkr status
```

## System Requirements

Shulkr requires **Debian 12+** (recommended) or any systemd-based Linux distribution. It runs natively on the host, no containerization needed.

::: warning Docker not supported
Shulkr has not been tested or optimized for Docker. Running it inside a Docker container is not recommended and may cause issues with server process management, SFTP, and systemd integration.
:::

## Next Step

[Configuration](/guide/configuration) - Configure your first Minecraft server
