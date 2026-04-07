<div align="center">

# Shulkr

**Console, files, backups, firewall, domains, SFTP, scheduled tasks — a single self-hosted panel to manage and secure your Minecraft servers.**

[![License: AGPL-3.0](https://img.shields.io/github/license/sylfaeen/shulkr)](LICENSE)
[![GitHub release](https://img.shields.io/github/v/release/sylfaeen/shulkr)](https://github.com/sylfaeen/shulkr/releases)
[![Last commit](https://img.shields.io/github/last-commit/sylfaeen/shulkr)](https://github.com/sylfaeen/shulkr/commits/main)
[![Debian](https://img.shields.io/badge/debian-%3E%3D12-a80030)](https://www.debian.org)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

[Documentation](https://shulkr.dev/docs/introduction/) · [Installation](https://shulkr.dev/docs/getting-started/installation/) · [Report a bug](https://github.com/sylfaeen/shulkr/issues)

</div>

---

## Table of contents

- [Overview](#overview)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Quick install](#quick-install)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)

## Overview

Shulkr is a lightweight, modern and open-source management panel for Minecraft servers. It provides a full-featured web interface to control, monitor and secure your servers from any browser — no direct command-line access required.

Designed to run on a Linux VPS or dedicated server, Shulkr installs with a single command and automatically handles all required dependencies: Node.js, Java, Nginx and SSL certificates. Once set up, the panel gives you complete control over your Minecraft servers through an intuitive, responsive interface.

Shulkr is built on a modern monorepo architecture with a Fastify backend and a React frontend communicating in real time via WebSocket. The embedded SQLite database requires no external configuration — everything is self-contained.

## Features

| | Feature | Description |
|---|---|---|
| **>_** | **Real-time console** | View logs and execute commands on your servers in real time |
| **📁** | **File manager** | Built-in Monaco editor to modify your configurations directly from the browser |
| **🧩** | **Plugin management** | Install, update and manage plugins via drag-and-drop or the PaperMC catalog |
| **⏰** | **Scheduled tasks** | Automate restarts, backups and custom commands on a schedule |
| **📊** | **Monitoring** | Real-time tracking of CPU, RAM and connected player count |
| **👥** | **Multi-user** | Granular permission system to control access for each user |
| **💾** | **Backups** | Automated backups with one-click restore |
| **🌐** | **Custom domains** | Configure your own domains with automatic HTTPS via Let's Encrypt |
| **🔒** | **Firewall** | Built-in iptables rules to secure your server ports |
| **📂** | **SFTP access** | Built-in SFTP server for bulk file transfers |

## Tech stack

| Layer | Technologies |
|---|---|
| **Backend** | Fastify, tRPC, SQLite, Drizzle ORM |
| **Frontend** | React 19, Vite, TailwindCSS 4, TanStack Router |
| **Real-time** | Native WebSocket |
| **Deployment** | Node.js 20+, Nginx, Certbot, systemd |

## Quick install

Connect to your Linux server (Debian/Ubuntu) via SSH and run:

```bash
curl -fsSL https://raw.githubusercontent.com/sylfaeen/shulkr/main/scripts/install.sh | bash
```

The interactive installer takes care of everything: installing dependencies, configuring Nginx, generating secrets and creating the admin account.

> **Prerequisites:** a Linux server (Debian 12+ or Ubuntu 22.04+) with SSH access and root privileges. The installer automatically handles the rest.

For detailed instructions, advanced configuration and deployment options, see the **[full documentation](https://shulkr.dev/docs/getting-started/installation/)**.

## Documentation

The complete documentation is available at **[shulkr.dev/docs](https://shulkr.dev/docs/introduction/)**:

- **[Introduction](https://shulkr.dev/docs/introduction/)** — Discover what Shulkr is and why use it
- **[Prerequisites](https://shulkr.dev/docs/getting-started/prerequisites/)** — What you need before getting started
- **[Installation](https://shulkr.dev/docs/getting-started/installation/)** — Step-by-step installation guide
- **[Configuration](https://shulkr.dev/docs/getting-started/configuration/)** — Customize your setup

## Contributing

Contributions are welcome! Feel free to open an [issue](https://github.com/sylfaeen/shulkr/issues) to report a bug or suggest an improvement.

## License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE).
