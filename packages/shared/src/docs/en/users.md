# Users

Manage users and their permissions in Shulkr.

## Permissions

Shulkr uses a granular permissions system:

| Permission             | Description                           |
| ---------------------- | ------------------------------------- |
| `*`                    | All permissions (admin)               |
| **Server**             |                                       |
| `server:power`         | Start, stop, restart servers          |
| `server:console`       | Access server console                 |
| `server:general`       | Create, rename, delete servers        |
| `server:backups`       | Create, list, delete backups          |
| `server:tasks`         | Manage scheduled tasks                |
| `server:plugins`       | List, enable, disable, upload plugins |
| `server:jars`          | List, download, switch server JARs    |
| `server:jvm`           | Configure Java & JVM flags            |
| `server:sftp`          | Manage SFTP accounts per server       |
| `server:domains`       | Manage custom domains & SSL           |
| **Files**              |                                       |
| `files:read`           | Read server files                     |
| `files:write`          | Write, delete, rename server files    |
| **Users**              |                                       |
| `users:manage`         | Manage users                          |
| **Shulkr Settings**    |                                       |
| `settings:general`     | View version info, IP, systemd unit   |
| `settings:environment` | Read and edit the .env file           |
| `settings:firewall`    | Manage firewall rules                 |
| `settings:sftp`        | View global SFTP connection info      |
