# Domains

The installation script automatically sets up Nginx as a reverse proxy. Your panel is immediately accessible via your server's IP address (e.g., `http://192.168.1.50`).

This guide covers the Nginx configuration and how to set up a custom domain with HTTPS.

## Nginx Configuration

The configuration file is located at `/etc/nginx/sites-available/shulkr`. After installation, it looks like this:

```nginx
server {
    listen 80;
    server_name _;

    client_max_body_size 256M;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /docs/ {
        alias $SHULKR_HOME/app/docs/.vitepress/dist/;  # Replace $SHULKR_HOME with your actual path
        try_files $uri $uri/ /docs/index.html;
    }

    location /ws {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

To edit the configuration:

```bash
sudo nano /etc/nginx/sites-available/shulkr
```

After any change, test and reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### Upload Size Limit

The `client_max_body_size` directive controls the maximum allowed size for file uploads (JAR files, plugins, etc.). The default is set to `256M`.

If you encounter a **413 Request Entity Too Large** error when uploading files, increase this value:

```nginx
client_max_body_size 512M;
```

::: warning
Nginx's default `client_max_body_size` is only `1M`. Without this directive, uploading JAR files (~50MB) or large plugins will fail with a 413 error.
:::

### WebSocket

The `/ws` location block is required for real-time WebSocket connections (`/ws` and `/ws/console`). It upgrades HTTP connections to WebSocket. Do not remove this block.

## Custom Domain

### Prerequisites

- A registered domain name (e.g., `panel.example.com`)
- A DNS `A` record pointing to your server's public IP
- Shulkr installed and running

### 1. Edit the Nginx configuration

Open the Nginx configuration file:

```bash
sudo nano /etc/nginx/sites-available/shulkr
```

Replace `server_name _` with your domain:

```nginx
server_name panel.example.com;
```

### 2. Reload Nginx

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Your panel is now accessible at `http://panel.example.com`.

## HTTPS with Let's Encrypt

Certbot is already installed by the installation script. Simply run:

```bash
sudo certbot --nginx -d panel.example.com
```

Certbot will automatically update your Nginx configuration to enable HTTPS and redirect HTTP traffic.

### Enable secure cookies

Once HTTPS is active, add this variable to your Shulkr `.env` file:

```bash
SECURE_COOKIES=true
```

Then restart the service:

```bash
sudo systemctl restart shulkr
```

::: warning Important
Only set `SECURE_COOKIES=true` **after** HTTPS is configured. Without HTTPS, the authentication cookie will not be sent by the browser and you will be logged out on every page refresh.
:::

### Verify automatic renewal

Let's Encrypt certificates expire after 90 days. Certbot installs a timer that renews them automatically. Verify it's active:

```bash
sudo systemctl status certbot.timer
```

## Caddy (Alternative)

If you prefer [Caddy](https://caddyserver.com/) over Nginx, it handles HTTPS automatically with zero configuration:

### 1. Install Caddy

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy -y
```

### 2. Disable Nginx and configure Caddy

```bash
sudo systemctl stop nginx
sudo systemctl disable nginx
sudo nano /etc/caddy/Caddyfile
```

```caddy
panel.example.com {
    reverse_proxy 127.0.0.1:3001
}
```

### 3. Restart Caddy

```bash
sudo systemctl restart caddy
```

Caddy automatically provisions and renews the HTTPS certificate. Once active, add `SECURE_COOKIES=true` to your `.env` and restart Shulkr.

## Summary

| Setup                | URL                         | `SECURE_COOKIES`  |
| -------------------- | --------------------------- | ----------------- |
| IP only (default)    | `http://192.168.1.50`       | `false` (default) |
| Domain without HTTPS | `http://panel.example.com`  | `false` (default) |
| Domain with HTTPS    | `https://panel.example.com` | `true`            |

## Next Step

[Security](/guide/security) - Learn more about Shulkr's security features
