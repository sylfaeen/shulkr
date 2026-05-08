# Introducción

Shulkr es un panel de gestión ligero y moderno para servidores de Minecraft. Te permite controlar tu servidor desde una interfaz web intuitiva.

## Funciones principales

- **Consola en tiempo real**, ver los logs y enviar comandos
- **Gestión de archivos**, editor Monaco integrado para modificar configuraciones
- **Plugins**, subir y gestionar plugins por arrastrar y soltar
- **Tareas programadas**, reinicios y copias de seguridad automáticos
- **Monitoreo**, CPU, RAM y jugadores en tiempo real
- **Multiusuario**, permisos granulares por usuario

## Stack técnico

Shulkr está construido con tecnologías modernas:

| Componente  | Tecnología                  |
| ----------- | --------------------------- |
| Backend     | Fastify + ts-rest + SQLite  |
| Frontend    | React + Vite + Tailwind CSS |
| Tiempo real | WebSocket (nativo)          |
| Base        | SQLite + Drizzle ORM        |

## Requisitos

- **Node.js** 20 LTS o superior
- **pnpm** (gestor de paquetes)
- **Linux** en producción (macOS para desarrollo)

## Próximo paso

1. [Instalación](/guide/installation)
