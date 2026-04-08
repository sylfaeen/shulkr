# Configuration

After installation, configure Shulkr to manage your Minecraft server.

## Minecraft Server Configuration

### Add a Server

1. Log in to the panel
2. Click **Add Server**
3. Fill in the information:

| Field   | Description                    |
| ------- | ------------------------------ |
| Name    | Display name for the server    |
| Min RAM | Minimum memory (e.g., `1G`)    |
| Max RAM | Maximum memory (e.g., `4G`)    |
| Port    | Server port (default: `25565`) |

The server directory is automatically created under `SERVERS_BASE_PATH`.

### Download PaperMC

Shulkr can automatically download PaperMC:

1. Go to server **Settings**
2. Section **JAR Management**
3. Select the Minecraft version
4. Click **Download**

## Environment Variables

All configuration is done through the `.env` file at the project root.

### Paths

| Variable            | Description                                  | Default                  |
| ------------------- | -------------------------------------------- | ------------------------ |
| `SHULKR_HOME`       | Base directory for all Shulkr data           | `/opt/shulkr`            |
| `SERVERS_BASE_PATH` | Directory where Minecraft servers are stored | `$SHULKR_HOME/servers`   |
| `BACKUPS_BASE_PATH` | Directory where backups are stored           | `$SHULKR_HOME/backups`   |
| `DATABASE_PATH`     | Path to the SQLite database file             | `$SHULKR_HOME/shulkr.db` |

### Security

| Variable         | Description                        | Default                         |
| ---------------- | ---------------------------------- | ------------------------------- |
| `JWT_SECRET`     | Secret for JWT tokens              | Auto-generated on first startup |
| `COOKIE_SECRET`  | Secret for cookie signing          | Auto-generated on first startup |
| `SECURE_COOKIES` | Enable secure cookies (HTTPS only) | `false`                         |

Secrets are generated automatically if left empty and written back to the `.env` file on first startup.

### Directory structure

```
$SHULKR_HOME/
├── app/              # Panel application
├── servers/          # Minecraft servers
├── backups/          # Automatic backups
└── shulkr.db        # SQLite database
```

## JVM Configuration

### Aikar Flags (recommended)

For better performance, enable Aikar flags:

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

These flags are available in the server settings.

## Service Management

The installation script automatically configures a systemd service. Shulkr starts at boot and restarts on failure.

The `shulkr` CLI provides quick access to common operations:

```bash
shulkr status      # Show service status, port, Nginx, and access URL
shulkr start       # Start the service
shulkr stop        # Stop the service
shulkr restart     # Restart the service
shulkr logs        # Follow live logs (journalctl)
shulkr update      # Update Shulkr to the latest version
shulkr domains     # Show Nginx domains and test connectivity
shulkr version     # Show current version
shulkr uninstall   # Remove Shulkr and all its files (keeps packages)
```

## Updating Shulkr

To update Shulkr to the latest version:

```bash
sudo shulkr update
```

The updater will:

1. Show the current and target versions
2. Stop the Shulkr service and all managed Minecraft servers
3. Download and install the new version
4. Restart everything automatically

**Preserved during updates:**

- Database (`$SHULKR_HOME/shulkr.db`)
- Configuration (`.env`, secrets, sessions)
- Minecraft servers (`$SERVERS_BASE_PATH`)
- Backups (`$BACKUPS_BASE_PATH`)

To update to a specific version instead of the latest:

```bash
sudo SHULKR_VERSION=0.5.0 shulkr update
```

## Uninstalling Shulkr

To completely remove Shulkr from your system:

```bash
sudo shulkr uninstall
```

You will be asked to type `DELETE` to confirm. The command can be cancelled at any time before confirmation.

### What is removed

The uninstall command removes **only** files and configurations created by the Shulkr installer:

| What              | Path                                 | Description                                                   |
| ----------------- | ------------------------------------ | ------------------------------------------------------------- |
| Application       | `$SHULKR_HOME/app/`                  | Panel code, built assets, dependencies                        |
| Database          | `$SHULKR_HOME/shulkr.db`             | All user accounts, server configs, scheduled tasks            |
| Configuration     | `$SHULKR_HOME/app/.env`              | Secrets, paths                                                |
| Minecraft servers | `$SERVERS_BASE_PATH/`                | All server files, worlds, configurations                      |
| Backups           | `$BACKUPS_BASE_PATH/`                | All automatic backups                                         |
| Systemd service   | `/etc/systemd/system/shulkr.service` | Service unit file only — systemd itself is untouched          |
| Nginx site        | `/etc/nginx/sites-available/shulkr`  | Shulkr site config only — Nginx and other sites are untouched |
| Nginx symlink     | `/etc/nginx/sites-enabled/shulkr`    | Enabled site symlink                                          |
| CLI               | `/usr/local/bin/shulkr`              | The `shulkr` command                                          |
| System user       | `shulkr`                             | The Linux user created during installation                    |

After removing the Nginx configuration, Nginx is automatically reloaded if it is running.

### What is NOT removed

System packages installed as dependencies are **never** removed:

- **Node.js** and **pnpm**
- **Java** (Adoptium Temurin 21 & 17) and the Adoptium APT/YUM repository
- **Nginx** and all non-Shulkr site configurations
- **Certbot** and any Let's Encrypt certificates

::: danger
This action is irreversible. All Minecraft server files, worlds, backups, and the database will be permanently deleted. Make sure to back up anything you want to keep before running this command.
:::

### Execution order

1. **Stop Minecraft servers** — kills all Java processes running from `$SERVERS_BASE_PATH`
2. **Stop systemd service** — runs `systemctl stop shulkr` and `systemctl disable shulkr`
3. **Remove systemd unit** — deletes `/etc/systemd/system/shulkr.service` and reloads the daemon
4. **Remove Nginx config** — deletes the Shulkr site files and reloads Nginx
5. **Remove installation directory** — deletes `$SHULKR_HOME` and everything inside it
6. **Remove system user** — deletes the `shulkr` Linux user
7. **Remove CLI** — deletes `/usr/local/bin/shulkr`

## Next Step

[Server Management](/guide/server-management) - Start and control your server
