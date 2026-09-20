# Shulkr Core Plugin

`shulkr-core` is the optional companion plugin installed on your Minecraft server. Its only job is to push **verified, real-time telemetry** to the shulkr panel so that the Analytics, Players, and Performance pages can display accurate, source-of-truth data.

## Parity rule

Shulkr behaves identically whether the plugin is installed or not. The plugin is **purely additive**: it never replaces any panel mechanism. Without it, shulkr falls back on what it can observe from the host (process metrics, RCON, query, log parsing). With it, the same screens become more precise and richer because the data comes directly from the running server.

## Supported platforms

| Platform  | Status    | Notes                                          |
| --------- | --------- | ---------------------------------------------- |
| Paper     | Supported | Recommended runtime                            |
| Folia     | Supported | Same JAR as Paper, regional schedulers handled |
| Velocity  | Supported | Proxy mode, reports backends instead of worlds |
| Waterfall | Supported | Proxy mode, reports backends instead of worlds |

The plugin auto-detects the platform at startup and adjusts what it collects accordingly.

## What the plugin pushes

A snapshot is collected on a fixed interval and POSTed to the shulkr backend. Each snapshot contains:

### Server health

- **TPS** (ticks per second), 5s, 1m, 15m windows
- **MSPT** (milliseconds per tick) average
- **Memory**: used, max, heap used, heap max, non-heap used
- **Uptime** since plugin load

### Players (Paper / Folia)

For each connected player:

- UUID and username
- Current world
- Ping (ms)
- Health and food level
- X, Y, Z position
- Op flag

### Worlds (Paper / Folia)

For each loaded world:

- Name
- Entity count
- Loaded chunk count
- Player count

### Proxy backends (Velocity / Waterfall)

For each registered backend server:

- Backend name
- Online player count
- Reachability flag

### Metadata

- Plugin version and protocol version
- Platform name and version
- Collection timestamp (ISO 8601)

::: info
The plugin **does not** read or transmit chat messages, command history, inventories, world files, or anything outside the metrics snapshot listed above.
:::

## Installation

Installation is done from the panel, no manual file copy or token handling is required. The plugin lives as a dedicated block on your server's **JAR, Java & JVM** page.

### Step by step

1. Open your server in the panel and go to **Settings → JAR, Java & JVM**.
2. Scroll to the **shulkr-core plugin** block. If the plugin is not yet installed, you will see "Optional plugin, not installed" with a short description.
3. Click **Install plugin**. A dialog opens asking which platform this server runs on.
4. Pick the matching platform (Paper, Folia, Velocity, or Waterfall). The dialog shows the supported Minecraft versions for each.
5. Confirm. The panel writes the right JAR into `plugins/` and generates `plugins/shulkr-core/config.yml` with a fresh `server_id` and `token`. No file you have to edit by hand.
6. Restart the server. The block prompts you to do this and switches to "Pending first ping" until the plugin connects.

Once connected, the block displays the plugin status (Connected, Disconnected, Outdated), version, last seen timestamp, and the live `config.yml` values read from disk.

### Other actions on the same block

- **Reinstall** rewrites the JAR and `config.yml` (same token), useful after a panel update bumped the embedded plugin version.
- **Update** appears when the running plugin is older than the one bundled with shulkr.
- **Regenerate token** invalidates the old token and writes a new one. The plugin needs to be reinstalled or `config.yml` re-applied for the new token to take effect.
- **Disable / Re-enable** stops the backend from accepting pushes for this server, without touching the files on the Minecraft host.

::: info
The Install button is the only supported install path. The panel manages the JAR version, the config file, and the auth token together, treating them as one unit. Editing `plugins/shulkr-core/config.yml` by hand is fine for inspection, but a panel **Reinstall** will overwrite it.
:::

## Configuration

| Key                     | Default                 | Description                                          |
| ----------------------- | ----------------------- | ---------------------------------------------------- |
| `backend_url`           | `http://127.0.0.1:3001` | Where the plugin pushes snapshots                    |
| `server_id`             | (set by panel)          | Identifier of this server in shulkr                  |
| `token`                 | (set by panel)          | Authentication token, never share                    |
| `push_interval_seconds` | `5`                     | How often a snapshot is pushed                       |
| `protocol_version`      | `1`                     | Wire protocol, do not edit unless shulkr requires it |

::: warning
The token authenticates this server to your shulkr backend. Treat it like a password. Do not commit `config.yml` to a public repository.
:::

## Commands

Run from console or in-game (requires `shulkr.admin`, default: op):

| Command          | Effect                                                           |
| ---------------- | ---------------------------------------------------------------- |
| `/shulkr status` | Show plugin version, backend URL, server id, last push timestamp |
| `/shulkr reload` | Reload `config.yml` without restarting the server                |

## Permissions

| Node           | Default | Description                      |
| -------------- | ------- | -------------------------------- |
| `shulkr.admin` | op      | Run the `/shulkr` admin commands |

## How the panel uses the data

| Panel page              | With plugin                            | Without plugin                              |
| ----------------------- | -------------------------------------- | ------------------------------------------- |
| Players (online list)   | Live UUIDs, ping, position, health     | Names parsed from logs, no ping or position |
| Performance / Analytics | Real TPS, MSPT, heap from the JVM      | Process-level CPU and memory only           |
| Worlds                  | Entity and loaded-chunk counts         | Not available                               |
| Proxy view              | Backend reachability and player counts | Not available                               |
