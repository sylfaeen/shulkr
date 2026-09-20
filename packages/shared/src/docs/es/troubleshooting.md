# Resolución de problemas

Cuando Shulkr se comporta de manera inesperada, la CLI `shulkr debug` recoge en un solo comando todo lo que un mantenedor necesita para entender qué ha pasado.

## Dos modos, un solo comando

### Modo bundle (por defecto)

Genera un tarball para enviar al mantenedor:

```bash
sudo shulkr debug
```

Produce `/tmp/shulkr-debug-<timestamp>.tar.gz`. Sin límite de tamaño.

### Modo consola (inspección en directo)

Inspecciona una sección concreta directamente en el terminal:

```bash
shulkr debug summary         # Vista general en una página
shulkr debug tasks           # Ejecuciones de tareas (últimas 24h)
shulkr debug errors          # Entradas ERROR / WARN recientes
shulkr debug server <id>     # Logs y crash reports de un servidor
shulkr debug db              # Contadores DB, schema y anomalías detectadas
```

Añade `--since 1h` o `--since 2026-04-20` para restringir la ventana temporal (por defecto: 24h).

## Contenido del bundle

```text
shulkr-debug-<ts>/
├── meta.txt                # Versión Shulkr, Java, Node, OS
├── systemd/
│   ├── status.txt          # systemctl status shulkr
│   └── journal.txt         # Últimas 2000 entradas del journal (redactadas)
├── nginx/
│   ├── status.txt
│   └── config.txt          # /etc/nginx/sites-available/shulkr
├── db/
│   ├── schema.sql
│   ├── servers.csv         # Sólo columnas de la lista blanca
│   ├── scheduled_tasks.csv
│   ├── task_executions.csv # Últimas 24h
│   └── counts.txt
├── servers/
│   └── <id>/
│       ├── latest.log      # Últimas 500 líneas (redactadas)
│       └── crash-reports/
├── disk.txt                # df -h
└── MANIFEST.txt
```

## Seguridad, lo que nunca se recoge

Los secretos se **excluyen en origen**: no se redactan, simplemente no se leen. Puedes auditar la salida con confianza antes de enviarla.

**Nunca incluido:**

- El archivo `.env` y sus valores (`JWT_SECRET`, `COOKIE_SECRET`, `DATABASE_URL`, etc.)
- Claves privadas y certificados (`*.key`, `*.pem`, `*.crt`)
- Hashes de contraseñas de usuarios
- Contraseñas RCON
- URLs de webhooks, JWTs, claves API, credenciales S3 / R2 / B2
- Claves SSH (`~/.ssh/`, `/root/.ssh/`)
- Material de Let's Encrypt (`/etc/letsencrypt/`)

**Patrones de redacción aplicados al texto de los logs:**

- Direcciones IPv4 e IPv6 → `X.X.X.X` / `X:X:X:X` (loopback preservada)
- Direcciones de email → `<email>`
- JWTs (`eyJ...`) → `<jwt>`
- Tokens (`sk_...`, `pk_...`) → `<token>`
- Parámetros de query de URL (`?token=`, `?key=`, `?secret=`, `?password=`, `?api_key=`) → `?<param>=<redacted>`

Una verificación de no-regresión se ejecuta al final de cada generación de bundle. Si algún patrón sensible se cuela, el archivo se descarta y se muestra un error.

## Enviar el bundle al mantenedor

1. Genera el bundle: `sudo shulkr debug`
2. Lee la ruta mostrada al final, por ejemplo `/tmp/shulkr-debug-20260420-143022.tar.gz`
3. Sácalo del sistema (el archivo pertenece a `root` con modo `600`):

```bash
sudo cp /tmp/shulkr-debug-<ts>.tar.gz /home/<tu>/
sudo chown <tu>:<tu> /home/<tu>/shulkr-debug-<ts>.tar.gz
scp /home/<tu>/shulkr-debug-<ts>.tar.gz tu@local:/tmp/
```

4. Adjúntalo a tu informe de bug.

## Qué usar y cuándo

- **El servicio está caído, no tienes idea de por qué.** Lanza `sudo shulkr debug` y envía el bundle.
- **Las tareas programadas parecen estar fallando.** Lanza `shulkr debug tasks` para ver las últimas 24h en una tabla. Si una destaca, inspecciona más con `shulkr debug errors`.
- **Un servidor se comporta mal.** Lanza `shulkr debug server <id>`, muestra las últimas 100 líneas de `latest.log` y lista los crash reports.
- **Quieres un chequeo de salud antes de reportar nada.** Lanza `shulkr debug summary`. Señala los problemas obvios.
- **Sospechas inconsistencias en la base de datos.** Lanza `shulkr debug db`, detecta tareas programadas huérfanas, ejecuciones bloqueadas en `in_progress` y servidores marcados como running sin proceso correspondiente.

## El comando requiere sudo

La generación del bundle lee el journal de systemd y escribe en `/tmp` con permisos restringidos. Si olvidas `sudo`:

```text
Debug requires root, retry with: sudo shulkr debug
```

Los subcomandos de consola (`summary`, `tasks`, `errors`, `server`, `db`) que sólo leen la DB pueden ejecutarse sin sudo si el archivo de la DB es legible, si no, usa `sudo shulkr debug <subcomando>`.
