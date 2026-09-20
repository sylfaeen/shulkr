# Plugin Shulkr Core

`shulkr-core` es el plugin compañero opcional instalado en tu servidor de Minecraft. Su único trabajo es enviar **telemetría en tiempo real verificada** al panel de shulkr para que las páginas Analytics, Jugadores y Rendimiento muestren datos precisos y fiables.

## Regla de paridad

Shulkr se comporta de la misma forma con o sin el plugin instalado. El plugin es **puramente aditivo**: nunca reemplaza ningún mecanismo del panel. Sin él, shulkr se basa en lo que puede observar desde el host (métricas de proceso, RCON, query, parsing de logs). Con él, las mismas pantallas se vuelven más precisas y ricas porque los datos vienen directamente del servidor en ejecución.

## Plataformas soportadas

| Plataforma | Estado    | Notas                                                       |
| ---------- | --------- | ----------------------------------------------------------- |
| Paper      | Soportado | Runtime recomendado                                         |
| Folia      | Soportado | Mismo JAR que Paper, se gestionan los schedulers regionales |
| Velocity   | Soportado | Modo proxy, reporta backends en lugar de mundos             |
| Waterfall  | Soportado | Modo proxy, reporta backends en lugar de mundos             |

El plugin auto-detecta la plataforma al arrancar y ajusta lo que recoge en consecuencia.

## Lo que el plugin envía

Se recoge un snapshot a intervalos fijos y se envía mediante POST al backend de shulkr. Cada snapshot contiene:

### Salud del servidor

- **TPS** (ticks por segundo), ventanas 5s, 1m, 15m
- **MSPT** (milisegundos por tick) media
- **Memoria**: usada, máxima, heap usado, heap máximo, no-heap usado
- **Tiempo de actividad** desde la carga del plugin

### Jugadores (Paper / Folia)

Para cada jugador conectado:

- UUID y nombre
- Mundo actual
- Ping (ms)
- Salud y nivel de hambre
- Posición X, Y, Z
- Flag op

### Mundos (Paper / Folia)

Para cada mundo cargado:

- Nombre
- Número de entidades
- Número de chunks cargados
- Número de jugadores

### Backends del proxy (Velocity / Waterfall)

Para cada servidor backend registrado:

- Nombre del backend
- Jugadores en línea
- Flag de accesibilidad

### Metadatos

- Versión del plugin y versión del protocolo
- Nombre y versión de la plataforma
- Marca temporal de recogida (ISO 8601)

::: info
El plugin **no lee ni transmite** mensajes de chat, historial de comandos, inventarios, archivos del mundo, ni nada fuera del snapshot listado arriba.
:::

## Instalación

La instalación se hace desde el panel, no se requiere copia manual de archivos ni gestión de tokens. El plugin aparece como un bloque dedicado en la página **JAR, Java & JVM** de tu servidor.

### Paso a paso

1. Abre tu servidor en el panel y ve a **Ajustes → JAR, Java & JVM**.
2. Baja hasta el bloque **Plugin shulkr-core**. Si el plugin aún no está instalado, verás "Plugin opcional, no instalado" con una breve descripción.
3. Haz clic en **Instalar plugin**. Se abre un diálogo que pregunta la plataforma de este servidor.
4. Selecciona la plataforma adecuada (Paper, Folia, Velocity o Waterfall). El diálogo muestra las versiones de Minecraft soportadas para cada una.
5. Confirma. El panel escribe el JAR correcto en `plugins/` y genera `plugins/shulkr-core/config.yml` con un `server_id` y un `token` nuevos. No tienes que editar ningún archivo a mano.
6. Reinicia el servidor. El bloque te lo recuerda y cambia a "Esperando primer ping" hasta que el plugin se conecte.

Una vez conectado, el bloque muestra el estado del plugin (Conectado, Desconectado, Obsoleto), la versión, la última marca temporal de conexión y los valores live de `config.yml` leídos del disco.

### Otras acciones del mismo bloque

- **Reinstalar** reescribe el JAR y `config.yml` (mismo token), útil después de una actualización del panel que ha subido la versión incrustada del plugin.
- **Actualizar** aparece cuando el plugin en ejecución es más antiguo que el incluido con shulkr.
- **Regenerar el token** invalida el token antiguo y escribe uno nuevo. El plugin necesita ser reinstalado o `config.yml` re-aplicado para que el nuevo token tenga efecto.
- **Desactivar / Reactivar** detiene la aceptación de envíos por el backend para este servidor, sin tocar los archivos del host de Minecraft.

::: info
El botón Instalar es el único camino de instalación soportado. El panel gestiona la versión del JAR, el archivo de configuración y el token de autenticación juntos, como una unidad. Editar `plugins/shulkr-core/config.yml` a mano está bien para inspección, pero una **Reinstalación** desde el panel lo sobrescribirá.
:::

## Configuración

| Clave                   | Por defecto             | Descripción                                       |
| ----------------------- | ----------------------- | ------------------------------------------------- |
| `backend_url`           | `http://127.0.0.1:3001` | Dónde envía los snapshots el plugin               |
| `server_id`             | (puesto por el panel)   | Identificador de este servidor en shulkr          |
| `token`                 | (puesto por el panel)   | Token de autenticación, no compartir nunca        |
| `push_interval_seconds` | `5`                     | Frecuencia de envío de snapshots                  |
| `protocol_version`      | `1`                     | Protocolo, no editar salvo que shulkr lo requiera |

::: warning
El token autentica este servidor frente a tu backend de shulkr. Trátalo como una contraseña. No subas `config.yml` a un repositorio público.
:::

## Comandos

Ejecutar desde la consola o en juego (requiere `shulkr.admin`, por defecto: op):

| Comando          | Efecto                                                               |
| ---------------- | -------------------------------------------------------------------- |
| `/shulkr status` | Muestra versión del plugin, URL del backend, server id, último envío |
| `/shulkr reload` | Recarga `config.yml` sin reiniciar el servidor                       |

## Permisos

| Nodo           | Por defecto | Descripción                           |
| -------------- | ----------- | ------------------------------------- |
| `shulkr.admin` | op          | Ejecutar los comandos admin `/shulkr` |

## Cómo usa el panel los datos

| Página del panel         | Con plugin                                      | Sin plugin                                        |
| ------------------------ | ----------------------------------------------- | ------------------------------------------------- |
| Jugadores (lista online) | UUIDs, ping, posición y salud en directo        | Nombres parseados de logs, sin ping ni posición   |
| Rendimiento / Analytics  | TPS, MSPT y heap reales desde la JVM            | Sólo métricas de CPU y memoria a nivel de proceso |
| Mundos                   | Conteo de entidades y chunks cargados           | No disponible                                     |
| Vista proxy              | Accesibilidad y conteo de jugadores por backend | No disponible                                     |
