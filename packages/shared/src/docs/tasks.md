# Scheduled Tasks

Automate maintenance tasks for your server.

## Task Types

### Automatic Restart

Periodic server restart to:

- Free memory
- Apply plugin updates
- Maintain performance

### Automatic Backup

Backup of the `world` folder:

- Compressed to `.zip`
- Automatic timestamp
- Configurable storage

## Cron Expressions

Format: `minute hour day month day_of_week`

### Common Examples

| Expression    | Description                    |
| ------------- | ------------------------------ |
| `0 4 * * *`   | Every day at 4:00 AM           |
| `0 */6 * * *` | Every 6 hours                  |
| `30 3 * * 0`  | Sunday at 3:30 AM              |
| `0 0 1 * *`   | First of the month at midnight |
