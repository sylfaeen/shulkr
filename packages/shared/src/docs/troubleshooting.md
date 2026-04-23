# Troubleshooting

When Shulkr behaves unexpectedly, the `shulkr debug` CLI collects everything a maintainer needs to understand what happened — in a single command.

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

Secrets are **excluded at the source** — they are not redacted, they are simply never read. You can audit the output with confidence before sending it.

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
2. Read the path displayed at the end — for example `/tmp/shulkr-debug-20260420-143022.tar.gz`
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
- **One server is misbehaving.** Run `shulkr debug server <id>` — it shows the last 100 lines of `latest.log` and lists crash reports.
- **You want a health check before reporting anything.** Run `shulkr debug summary`. It flags the obvious problems.
- **You suspect database inconsistencies.** Run `shulkr debug db` — it detects orphan scheduled tasks, stuck `in_progress` executions, and servers marked running without a matching process.

## Command requires sudo

Bundle generation reads the systemd journal and writes to `/tmp` with restricted permissions. If you forget `sudo`:

```text
Debug requires root — retry with: sudo shulkr debug
```

Console sub-commands (`summary`, `tasks`, `errors`, `server`, `db`) that only read the DB may run without sudo if the DB file is readable — otherwise, use `sudo shulkr debug <subcommand>`.
