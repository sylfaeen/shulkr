# Introduction

Shulkr is a lightweight and modern management panel for Minecraft servers. It allows you to control your server from an intuitive web interface.

## Main Features

- **Real-time Console** - View logs and send commands
- **File Management** - Integrated Monaco editor to modify configurations
- **Plugins** - Upload and manage plugins via drag & drop
- **Scheduled Tasks** - Automatic restarts and backups
- **Monitoring** - CPU, RAM, and players in real-time
- **Multi-user** - Granular permissions per user

## Tech Stack

Shulkr is built with modern technologies:

| Component | Technology                  |
| --------- | --------------------------- |
| Backend   | Fastify + tRPC + SQLite     |
| Frontend  | React + Vite + Tailwind CSS |
| Real-time | WebSocket (Socket.io)       |
| Database  | SQLite + Drizzle ORM        |

## Prerequisites

- **Node.js** 20 LTS or higher
- **pnpm** (package manager)
- **Linux** for production (macOS for development)

## Next Steps

1. [Installation](/guide/installation)
