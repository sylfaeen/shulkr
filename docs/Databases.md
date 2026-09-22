# Databases

Shulkr can create MariaDB databases for your plugins, one dedicated user per database, and optionally open a remote access limited to a single IP address for a website or an external tool.

## What you get

Creating a database from the panel runs three statements on the machine:

```sql
CREATE DATABASE `s_ab12cd_flyteams` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'u_ab12cd_flyteams'@'127.0.0.1' IDENTIFIED BY '<32 random bytes>' WITH MAX_USER_CONNECTIONS 30;
GRANT ALL PRIVILEGES ON `s_ab12cd_flyteams`.* TO 'u_ab12cd_flyteams'@'127.0.0.1';
```

`ALL PRIVILEGES` applies to that database only. Your plugin can run its migrations, create and alter tables, read and write, and it can see nothing else. The `s_ab12cd_` prefix is unique per server, so two servers can both own a database called `flyteams` without ever reaching each other's.

MariaDB is installed and hardened by `install.sh`, and listens on `127.0.0.1` only. Nothing is reachable from the internet until you create a remote access. Updating Shulkr never touches the engine: if it is missing on a machine, run `sudo /opt/shulkr/app/scripts/subs/subs_database.sh install`, which is the same idempotent step the installer runs.

## Connecting a plugin

Open your server, go to **Databases**, click **Create a database** and give it a name. The panel shows the credentials once and offers a ready to paste block:

```yaml
database:
  host: 127.0.0.1
  port: 3306
  name: s_ab12cd_flyteams
  user: u_ab12cd_flyteams
  password: "..."
```

Paste it into the plugin configuration and restart the server. The host is `127.0.0.1` because the Minecraft server and MariaDB run on the same machine.

To see the password again later, use the eye button: your account password is asked again and the reveal is written to the audit log.

### Opening the database in a client

The panel also shows a **connection URL**, the same kind Laravel Forge displays:

```
mysql+ssh://root@<server ip>/<db user>:<password>@127.0.0.1/<db name>?name=<label>&usePrivateKey=true
```

Paste it into TablePlus (or any client that reads these URLs) and it opens the SSH tunnel itself, then connects as if the database were local. Nothing needs to be opened on the firewall for this.

The SSH account in the URL is `root`, which is the usual one on a self-hosted VPS. If you log in with another account, set `SSH_TUNNEL_USER` in `/opt/shulkr/app/.env` and restart the panel.

A remote access shows a direct URL instead, with no tunnel, since it reaches the engine on its own.

## Connecting a website or an external tool

A plugin never needs this. It is for a site that displays your data, or for a database client on your own machine.

In the database entry, open **Additional accesses** and add one:

- **Name**: what this access is for, for example `flycraft-site`.
- **Scope**: *read only* can consult the data, *read and write* can also add, edit and delete rows. Neither can change the structure of the tables, that stays with the plugin user.
- **Allowed IP address**: one single address. Ranges, CIDR notations and wildcards are refused by the form, by the API and by the privileged script.
- **Require a client certificate**: optional, see below.

Creating the first remote access on the machine restarts MariaDB, because `bind-address` is instance-wide. Connected plugins are disconnected for a second or two, so prefer a quiet moment. When the last remote access is revoked, the engine goes back to listening on the loopback only.

Three independent locks protect a remote access: the firewall only opens the port for that IP, the MariaDB grant is bound to that IP, and the connection must be encrypted.

Example for a Laravel site, as a second connection in `config/database.php`:

```php
'shulkr' => [
    'driver' => 'mysql',
    'host' => env('SHULKR_DB_HOST'),
    'port' => env('SHULKR_DB_PORT', '3306'),
    'database' => env('SHULKR_DB_DATABASE'),
    'username' => env('SHULKR_DB_USERNAME'),
    'password' => env('SHULKR_DB_PASSWORD'),
    'options' => [PDO::MYSQL_ATTR_SSL_CA => env('SHULKR_DB_SSL_CA')],
],
```

Download the CA certificate from the panel and point `SHULKR_DB_SSL_CA` at it.

### About TLS

Remote users are created with `REQUIRE SSL`, which forces encryption but does not authenticate anyone. With a self-signed certificate, a client that does not verify the CA is protected against passive eavesdropping, not against an active man in the middle. Configure the CA on the client side, it takes one line.

Turning on **Require a client certificate** creates the user with `REQUIRE X509` instead and issues a certificate signed by the panel's own authority. A stolen password is then not enough to connect. The certificate and its key are shown once, at creation.

### Dynamic IP addresses

A home connection changes address. When yours changes, the access stops working: rotate it by revoking and recreating it with the new address. For development, an SSH tunnel is simpler and safer, and needs nothing on the panel side:

```bash
ssh -L 3306:127.0.0.1:3306 user@your-server
```

Your local client then connects to `127.0.0.1:3306` with no port open on the internet.

An access with no observed activity for 30 days is flagged as unused in the panel. Revoke it: an IP address changes hands, a residential address gets reassigned and a destroyed VPS returns its own to the provider pool.

## Rotating and deleting

**Rotating a password** takes effect immediately on the MariaDB side. Plugins keep their open connections and fail on the next reconnection, which can happen hours later. Update the plugin configuration and restart the server right after rotating.

**Deleting a database** asks you to type its full name. A compressed dump is written to `/var/lib/shulkr/db-dumps` before anything is dropped, owned by root, and pruned after 7 days. Restoring it requires SSH access, the panel does not offer a restore.

Deleting a server drops its databases the same way, with the same dumps.

## Security, and what it does not cover

What this feature protects against:

- No network exposure by default, the engine listens on the loopback.
- One user per database, privileges bound to that database, no global privilege, no `GRANT OPTION`, no `FILE`.
- Connection limits per user, so a misbehaving plugin cannot exhaust the engine for the others.
- Clean revocation and rotation, and an audit entry for every creation, reveal, rotation and deletion.

What it does not protect against, and this matters:

**All Minecraft servers on the machine run under the same system user.** A malicious plugin installed on one server can read another server's `config.yml` and get its database credentials. Database isolation limits the damage if a password leaks off the machine, it does not isolate you from a hostile neighbour on the machine itself. If you host servers for people you do not trust, this feature does not make that safe.

**Server backups do not contain the database.** Restoring an old backup brings the plugin files back to a past state while its database stays current. For a plugin whose data is split between files and database, that produces inconsistencies. Take a manual dump before restoring.

## If you suspect a leak

1. Rotate the password of the database or the access concerned.
2. Check the audit log, under Users, for reveals you did not make.
3. Revoke every remote access you no longer use.
4. Check that the engine is back to local-only listening if no remote access remains: the Databases page shows the current state.
