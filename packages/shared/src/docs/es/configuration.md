# Configuración

Tras la instalación, configura Shulkr para gestionar tu servidor de Minecraft.

## Configuración del servidor de Minecraft

### Añadir un servidor

1. Inicia sesión en el panel
2. Haz clic en **Añadir servidor**
3. Rellena la información:

| Campo   | Descripción                        |
| ------- | ---------------------------------- |
| Nombre  | Nombre visible del servidor        |
| RAM mín | Memoria mínima (ej. `1G`)          |
| RAM máx | Memoria máxima (ej. `4G`)          |
| Puerto  | Puerto del servidor (def. `25565`) |

El directorio del servidor se crea automáticamente bajo `SERVERS_BASE_PATH`.

### Descargar PaperMC

Shulkr puede descargar PaperMC automáticamente:

1. Ve a **Ajustes** del servidor
2. Sección **Gestión de JAR**
3. Selecciona la versión de Minecraft
4. Haz clic en **Descargar**

## Variables de entorno

Toda la configuración se hace mediante el archivo `.env` en la raíz del proyecto.

### Rutas

| Variable            | Descripción                                  | Por defecto              |
| ------------------- | -------------------------------------------- | ------------------------ |
| `SHULKR_HOME`       | Directorio base de todos los datos de Shulkr | `/opt/shulkr`            |
| `SERVERS_BASE_PATH` | Directorio de los servidores de Minecraft    | `$SHULKR_HOME/servers`   |
| `BACKUPS_BASE_PATH` | Directorio de las copias de seguridad        | `$SHULKR_HOME/backups`   |
| `DATABASE_PATH`     | Ruta del archivo SQLite                      | `$SHULKR_HOME/shulkr.db` |

### Seguridad

| Variable         | Descripción                         | Por defecto                      |
| ---------------- | ----------------------------------- | -------------------------------- |
| `JWT_SECRET`     | Secreto para los tokens JWT         | Auto-generado al primer arranque |
| `COOKIE_SECRET`  | Secreto para firmar cookies         | Auto-generado al primer arranque |
| `SECURE_COOKIES` | Activa cookies seguras (sólo HTTPS) | `false`                          |

Los secretos se generan automáticamente si están vacíos y se escriben en el `.env` en el primer arranque.

### Estructura de directorios

```
$SHULKR_HOME/
├── app/              # Aplicación del panel
├── servers/          # Servidores de Minecraft
├── backups/          # Copias de seguridad automáticas
└── shulkr.db        # Base SQLite
```

## Configuración JVM

### Aikar Flags (recomendado)

Para mejor rendimiento, activa los Aikar flags:

```
-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200
-XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC
-XX:+AlwaysPreTouch -XX:G1NewSizePercent=30
-XX:G1MaxNewSizePercent=40 -XX:G1HeapRegionSize=8M
-XX:G1ReservePercent=20 -XX:G1HeapWastePercent=5
-XX:G1MixedGCCountTarget=4 -XX:InitiatingHeapOccupancyPercent=15
-XX:G1MixedGCLiveThresholdPercent=90
-XX:G1RSetUpdatingPauseTimePercent=5 -XX:SurvivorRatio=32
-XX:+PerfDisableSharedMem -XX:MaxTenuringThreshold=1
```

Estos flags están disponibles en los ajustes del servidor.

## Gestión del servicio

El script de instalación configura automáticamente un servicio systemd. Shulkr arranca al boot y se reinicia ante fallos.

La CLI `shulkr` da acceso rápido a las operaciones habituales:

```bash
shulkr status      # Estado del servicio, puerto, Nginx y URL de acceso
shulkr start       # Arranca el servicio
shulkr stop        # Detiene el servicio
shulkr restart     # Reinicia el servicio
shulkr logs        # Sigue los logs en directo (journalctl)
shulkr update      # Actualiza Shulkr a la última versión
shulkr domains     # Muestra los dominios Nginx y comprueba conectividad
shulkr debug       # Genera un bundle de diagnóstico o inspecciona en directo (ver: Resolución de problemas)
shulkr version     # Muestra la versión actual
shulkr uninstall   # Elimina Shulkr y todos sus archivos (mantiene los paquetes)
```

Para generar una instantánea de diagnóstico que enviar al mantenedor, o inspeccionar el servicio en directo, ver la página [Resolución de problemas](./troubleshooting.md).

## Actualizar Shulkr

Para actualizar Shulkr a la última versión:

```bash
sudo shulkr update
```

El actualizador:

1. Muestra la versión actual y la versión objetivo
2. Detiene el servicio Shulkr y todos los servidores Minecraft gestionados
3. Descarga e instala la nueva versión
4. Reinicia todo automáticamente

**Conservado durante las actualizaciones:**

- Base de datos (`$SHULKR_HOME/shulkr.db`)
- Configuración (`.env`, secretos, sesiones)
- Servidores Minecraft (`$SERVERS_BASE_PATH`)
- Copias de seguridad (`$BACKUPS_BASE_PATH`)

Para actualizar a una versión específica en lugar de la última:

```bash
sudo SHULKR_VERSION=0.5.0 shulkr update
```

## Desinstalar Shulkr

Para eliminar completamente Shulkr de tu sistema:

```bash
sudo shulkr uninstall
```

Se te pedirá escribir `DELETE` para confirmar. La orden puede cancelarse en cualquier momento antes de la confirmación.

### Lo que se elimina

La desinstalación elimina **únicamente** los archivos y configuraciones creados por el instalador de Shulkr:

| Qué                  | Ruta                                 | Descripción                                                    |
| -------------------- | ------------------------------------ | -------------------------------------------------------------- |
| Aplicación           | `$SHULKR_HOME/app/`                  | Código del panel, assets compilados, dependencias              |
| Base de datos        | `$SHULKR_HOME/shulkr.db`             | Cuentas de usuario, configs de servidores, tareas programadas  |
| Configuración        | `$SHULKR_HOME/app/.env`              | Secretos, rutas                                                |
| Servidores Minecraft | `$SERVERS_BASE_PATH/`                | Todos los archivos de servidor, mundos, configuraciones        |
| Copias de seguridad  | `$BACKUPS_BASE_PATH/`                | Todas las copias automáticas                                   |
| Servicio systemd     | `/etc/systemd/system/shulkr.service` | Sólo el archivo de unidad, systemd no se toca                  |
| Sitio Nginx          | `/etc/nginx/sites-available/shulkr`  | Sólo la config del sitio Shulkr, Nginx y otros sitios intactos |
| Symlink Nginx        | `/etc/nginx/sites-enabled/shulkr`    | Symlink del sitio activado                                     |
| CLI                  | `/usr/local/bin/shulkr`              | El comando `shulkr`                                            |
| Usuario del sistema  | `shulkr`                             | El usuario Linux creado durante la instalación                 |

Tras eliminar la configuración Nginx, Nginx se recarga automáticamente si está corriendo.

### Lo que NO se elimina

Los paquetes del sistema instalados como dependencias **nunca** se eliminan:

- **Node.js** y **pnpm**
- **Java** (Adoptium Temurin 21 y 17) y el repositorio APT/YUM Adoptium
- **Nginx** y todas las configuraciones de sitios no-Shulkr
- **Certbot** y los certificados Let's Encrypt

::: danger
Esta acción es irreversible. Todos los archivos de servidor Minecraft, mundos, copias de seguridad y la base de datos serán borrados de forma permanente. Asegúrate de respaldar todo lo que quieras conservar antes de ejecutar este comando.
:::

### Orden de ejecución

1. **Detener servidores Minecraft**, mata todos los procesos Java que corren desde `$SERVERS_BASE_PATH`
2. **Detener el servicio systemd**, ejecuta `systemctl stop shulkr` y `systemctl disable shulkr`
3. **Eliminar la unidad systemd**, borra `/etc/systemd/system/shulkr.service` y recarga el daemon
4. **Eliminar la config Nginx**, borra los archivos del sitio Shulkr y recarga Nginx
5. **Eliminar el directorio de instalación**, borra `$SHULKR_HOME` y todo su contenido
6. **Eliminar el usuario del sistema**, borra el usuario Linux `shulkr`
7. **Eliminar la CLI**, borra `/usr/local/bin/shulkr`

## Próximo paso

[Gestión del servidor](/guide/server-management), arranca y controla tu servidor
