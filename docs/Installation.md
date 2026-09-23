# Installation

Shulkr can be installed in several ways depending on your environment.

## Quick Install (Linux)

The recommended method for a production server:

```bash
curl -fsSL https://raw.githubusercontent.com/sylfaeen/shulkr/main/scripts/install.sh | sudo bash
```

Verify that everything is running:

```bash
shulkr status
```

## System Requirements

Shulkr runs natively on a systemd-based Linux host, no containerization needed.

**Recommended distribution: Debian 13 (trixie)**, kept current with its point releases. Everything the installer takes from the distribution (nginx, ufw, fail2ban, certbot, OpenSSH) lives in Debian `main` with full security support, and the install and maintenance scripts run on the classic GNU coreutils and sudo they were written for. Node.js and Java come from the NodeSource and Adoptium repositories, so the distribution does not limit which Minecraft versions you can run.

Also supported:

- **Debian 12 (bookworm)**: works, but it is now in its LTS phase. Prefer Debian 13 for a new server.
- **Ubuntu 22.04 LTS and 24.04 LTS**: work. certbot and fail2ban come from the `universe` pocket, so enable Ubuntu Pro (free for personal use on up to five machines) if you want security updates for them.
- **Ubuntu 26.04 LTS**: not recommended yet. Its default sudo and coreutils are Rust rewrites (sudo-rs, uutils) that Shulkr's scripts have not been validated against.

Start from a fresh minimal install with root access, the installer handles the rest.

> **Warning: Docker not supported**
>
> Shulkr has not been tested or optimized for Docker. Running it inside a Docker container is not recommended and may cause issues with server process management, SFTP, and systemd integration.

## Next Step

[Configuration](Configuration) - Configure your first Minecraft server
