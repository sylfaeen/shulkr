# Installation

Shulkr can be installed in several ways depending on your environment.

## Quick Install (Linux)

The recommended method for a production server:

```bash
curl -fsSL https://raw.githubusercontent.com/sylfaeen/shulkr/main/install.sh | sudo bash
```

The script will prompt you for the installation directory (default: `/opt/shulkr`), then:

- Installs Node.js, pnpm, Nginx, and Certbot
- Downloads the latest version of Shulkr
- Generates the `.env` file with your paths and secure random secrets
- Configures Nginx reverse proxy and systemd service
- Starts Shulkr automatically

Verify that everything is running:

```bash
shulkr status
```

### Custom installation path

You can also set the installation path via environment variable:

```bash
curl -fsSL https://raw.githubusercontent.com/sylfaeen/shulkr/main/install.sh | sudo SHULKR_HOME=/srv/shulkr bash
```

## Manual Installation

### 1. Clone the repository

```bash
git clone https://github.com/sylfaeen/shulkr.git
cd shulkr
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Configure the environment

```bash
cp .env.example .env
```

Edit the `.env` file with your paths:

```env
SHULKR_HOME=/opt/shulkr
SERVERS_BASE_PATH=/opt/shulkr/servers
BACKUPS_BASE_PATH=/opt/shulkr/backups
DATABASE_PATH=/opt/shulkr/shulkr.db

JWT_SECRET=
COOKIE_SECRET=
SECURE_COOKIES=false
```

`JWT_SECRET` and `COOKIE_SECRET` are automatically generated on first startup if left empty.

### 4. Build and start

```bash
pnpm build
pnpm start
```

## Docker Installation

```bash
docker run -d \
  --name shulkr \
  -p 3001:3001 \
  -v shulkr-data:/opt/shulkr \
  ghcr.io/sylfaeen/shulkr:latest
```

## Verification

Open your browser to `http://localhost:3001`

Default credentials:

- **Username**: `admin`
- **Password**: `admin`

::: warning IMPORTANT
Change the admin password immediately after the first login!
:::

## Next Step

[Configuration](/guide/configuration) - Configure your first Minecraft server
