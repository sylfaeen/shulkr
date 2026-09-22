# Troubleshooting

When Shulkr behaves unexpectedly, the `shulkr debug` CLI collects everything a maintainer needs to understand what happened, in a single command.

## Two modes, one command

### Bundle mode (default)

Generate a tarball you can send to the maintainer:

```bash
sudo shulkr debug
```

Produces `/tmp/shulkr-debug-<timestamp>.tar.gz`. No size cap.

### Console mode (inspect live)

Inspect a specific section directly in the terminal:

```bash
shulkr debug summary         # One-page overview
shulkr debug tasks           # Task executions (last 24h)
shulkr debug errors          # Recent ERROR / WARN entries
shulkr debug server <id>     # Logs and crash reports for a server
shulkr debug db              # DB counts, schema, and detected anomalies
```

Add `--since 1h` or `--since 2026-04-20` to restrict the time window (default: 24h).

## What's in the bundle

```text
shulkr-debug-<ts>/
├── meta.txt                # Shulkr version, Java, Node, OS
├── systemd/
│   ├── status.txt          # systemctl status shulkr
│   └── journal.txt         # Last 2000 journal entries (redacted)
├── nginx/
│   ├── status.txt
│   └── config.txt          # /etc/nginx/sites-available/shulkr
├── db/
│   ├── schema.sql
│   ├── servers.csv         # Whitelisted columns only
│   ├── scheduled_tasks.csv
│   ├── task_executions.csv # Last 24h
│   └── counts.txt
├── servers/
│   └── <id>/
│       ├── latest.log      # Last 500 lines (redacted)
│       └── crash-reports/
├── disk.txt                # df -h
└── MANIFEST.txt
```

## Security: what is never collected

Secrets are **excluded at the source**: they are not redacted, they are simply never read. You can audit the output with confidence before sending it.

**Never included:**

- The `.env` file and its values (`JWT_SECRET`, `COOKIE_SECRET`, `DATABASE_URL`, etc.)
- Private keys and certificates (`*.key`, `*.pem`, `*.crt`)
- User password hashes
- RCON passwords
- Webhook URLs, JWTs, API keys, S3 / R2 / B2 credentials
- SSH keys (`~/.ssh/`, `/root/.ssh/`)
- Let's Encrypt material (`/etc/letsencrypt/`)

**Redaction patterns applied to log text:**

- IPv4 and IPv6 addresses → `X.X.X.X` / `X:X:X:X` (loopback preserved)
- Email addresses → `<email>`
- JWTs (`eyJ...`) → `<jwt>`
- Tokens (`sk_...`, `pk_...`) → `<token>`
- URL query parameters (`?token=`, `?key=`, `?secret=`, `?password=`, `?api_key=`) → `?<param>=<redacted>`

A non-regression check runs at the end of every bundle generation. If any sensitive pattern slips through, the archive is discarded and an error is shown.

## Sending the bundle to the maintainer

1. Generate the bundle: `sudo shulkr debug`
2. Read the path displayed at the end, for example `/tmp/shulkr-debug-20260420-143022.tar.gz`
3. Transfer it out (the file is owned by `root` with mode `600`):

```bash
sudo cp /tmp/shulkr-debug-<ts>.tar.gz /home/<you>/
sudo chown <you>:<you> /home/<you>/shulkr-debug-<ts>.tar.gz
scp /home/<you>/shulkr-debug-<ts>.tar.gz you@local:/tmp/
```

4. Attach it to your bug report.

## When to use what

- **Service is down, you have no idea why.** Run `sudo shulkr debug` and send the bundle.
- **Scheduled tasks seem to be failing.** Run `shulkr debug tasks` to see the last 24h in a table. If one stands out, inspect further with `shulkr debug errors`.
- **One server is misbehaving.** Run `shulkr debug server <id>`, it shows the last 100 lines of `latest.log` and lists crash reports.
- **You want a health check before reporting anything.** Run `shulkr debug summary`. It flags the obvious problems.
- **You suspect database inconsistencies.** Run `shulkr debug db`, it detects orphan scheduled tasks, stuck `in_progress` executions, and servers marked running without a matching process.

## Command requires sudo

`start`, `stop`, `restart`, `update`, `domains`, `uninstall` and bundle-mode `debug` change the service or read system files, so they refuse to run unprivileged:

```text
✗ 'update' requires root
Run: sudo shulkr update or log in as root
```

The `shulkr` system account is not an administrator. It runs the panel and serves SFTP, and its sudo rules cover only the handful of helper scripts the panel calls for itself. Connecting with the SFTP credentials and running `sudo shulkr update` from there cannot work, whatever the password. Use an account that has sudo, or log in as root.

Bundle generation reads the systemd journal and writes to `/tmp` with restricted permissions. If you forget `sudo`:

```text
Debug requires root, retry with: sudo shulkr debug
```

Console sub-commands (`summary`, `tasks`, `errors`, `server`, `db`) that only read the DB may run without sudo if the DB file is readable, otherwise, use `sudo shulkr debug <subcommand>`.

## Locked out of root over SSH

The installer disables SSH password authentication globally, then re-enables it for the `shulkr` account and the per-server SFTP accounts only. If you installed the panel while logged in as root by password and never put an SSH key on the server, that door closes behind the installer: `ssh root@your-server` answers `Permission denied (publickey)`, and the `shulkr` account has no sudo rights to open it again.

The installer now looks for a key belonging to root or to a sudo account before disabling password authentication, and skips the step with a warning when it finds none. To recover an installation made before that check existed:

1. Open your provider's console (KVM, VNC, or equivalent). It is a local login, unaffected by the SSH configuration, so the root password still works there.
2. Add your public key to `/root/.ssh/authorized_keys` on the server.
3. If the root password is lost too, boot the server into the provider's rescue mode and reset it, or write your key in from the rescue system.

Once key-based root login works, finish the hardening the installer skipped:

```bash
echo 'PasswordAuthentication no' >> /etc/ssh/sshd_config.d/49-shulkr.conf
systemctl reload ssh
```

Do not retry failed SSH logins while you sort this out: fail2ban is installed and enabled, and it will ban your address on top of everything else.

## Panel unreachable after setting a custom domain

Setting a panel domain rewrites the Nginx vhost so it answers for that domain, and adds a fallback vhost that redirects IP access to it. If the domain does not reach your server, both doors are closed at once: the domain does not answer, and the IP redirects to the domain.

To keep you out of that state, _Configure_ now resolves the domain first and refuses it unless it points to this server. The panel tells you which address the domain resolves to and which one this server answers on. Installations that configured a domain before this check exists are unaffected, see [Recovering access from the server](#recovering-access-from-the-server) if you are already locked out.

### Cloudflare proxy, error 521

Shulkr issues its own Let's Encrypt certificate and serves the panel on ports 80 and 443. It is not designed to sit behind the Cloudflare proxy. When the DNS record is proxied (orange cloud), the domain resolves to Cloudflare, not to your server. Cloudflare then tries to reach your origin on port 443, finds nothing listening as long as SSL has not been enabled, and returns **error 521, Web server is down**.

Fix it in the Cloudflare dashboard, zone DNS tab: edit the record and switch **Proxy status** from _Proxied_ to **DNS only** (grey cloud). Confirm the change reached the authoritative servers, this answers immediately:

```bash
dig @$(dig +short NS example.com | head -1) +short A panel.example.com
```

Your server keeps serving the previous answer from its resolver cache for up to the record TTL, usually five minutes. Until it expires, enabling SSL still fails with a DNS mismatch even though the record is already correct.

_Configure_ tells these two cases apart: it compares your server's answer with the one public resolvers give, and reports propagation in progress rather than asking you to edit a zone that is already right. Enabling SSL has no such check, it only sees the stale local answer. Flush the cache instead of waiting:

```bash
sudo resolvectl flush-caches
```

### HSTS-preloaded domains require SSL

Whole TLDs are HSTS-preloaded in every browser, among them `.dev`, `.app`, `.page` and other Google-operated ones. Browsers refuse plain HTTP on them, with no click-through. On such a domain the panel stays unreachable between the _Configure_ step and the _Enable SSL_ step, so run both without waiting in between.

### Recovering access from the server

If you are locked out of the panel, enable SSL directly over SSH. This is the same command the Enable SSL button runs:

```bash
sudo /opt/shulkr/app/scripts/subs/subs_domain.sh enable-ssl panel.example.com
```

Once the panel opens again, click **Enable SSL** in Settings, General. The script alone does not update the database, `CORS_ORIGIN` and `SECURE_COOKIES`, and it is safe to run twice.

To drop the domain entirely and go back to plain IP access:

```bash
sudo /opt/shulkr/app/scripts/subs/subs_domain.sh reset-panel
```

Then remove the domain in Settings, General, so the panel state matches the server.
