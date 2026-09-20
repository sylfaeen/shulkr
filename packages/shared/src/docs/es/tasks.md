# Tareas programadas

Automatiza las tareas de mantenimiento de tu servidor.

## Tipos de tareas

### Reinicio automático

Reinicio periódico del servidor para:

- Liberar memoria
- Aplicar actualizaciones de plugins
- Mantener el rendimiento

### Copia de seguridad automática

Copia de seguridad de la carpeta `world`:

- Comprimida en `.zip`
- Marca temporal automática
- Almacenamiento configurable

## Expresiones cron

Formato: `minuto hora día mes día_semana`

### Ejemplos comunes

| Expresión     | Descripción                 |
| ------------- | --------------------------- |
| `0 4 * * *`   | Todos los días a las 4:00   |
| `0 */6 * * *` | Cada 6 horas                |
| `30 3 * * 0`  | Domingo a las 3:30          |
| `0 0 1 * *`   | Primero de mes a medianoche |
