# Instalación

Shulkr puede instalarse de varias formas según tu entorno.

## Instalación rápida (Linux)

El método recomendado para un servidor en producción:

```bash
curl -fsSL https://raw.githubusercontent.com/sylfaeen/shulkr/main/install.sh | sudo bash
```

Verifica que todo funciona:

```bash
shulkr status
```

## Requisitos del sistema

Shulkr requiere **Debian 12+** (recomendado) o cualquier distribución Linux basada en systemd. Se ejecuta de forma nativa en el host, sin contenedores.

::: warning Docker no soportado
Shulkr no ha sido probado ni optimizado para Docker. Ejecutarlo dentro de un contenedor Docker no está recomendado y puede causar problemas con la gestión de procesos del servidor, SFTP e integración con systemd.
:::

## Próximo paso

[Configuración](/guide/configuration), configura tu primer servidor de Minecraft
