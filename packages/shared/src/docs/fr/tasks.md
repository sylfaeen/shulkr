# Tâches planifiées

Automatise les tâches de maintenance de ton serveur.

## Types de tâches

### Redémarrage automatique

Redémarrage périodique du serveur pour :

- Libérer la mémoire
- Appliquer les mises à jour de plugins
- Maintenir les performances

### Sauvegarde automatique

Sauvegarde du dossier `world` :

- Compressée en `.zip`
- Horodatage automatique
- Stockage configurable

## Expressions cron

Format : `minute heure jour mois jour_semaine`

### Exemples courants

| Expression    | Description              |
| ------------- | ------------------------ |
| `0 4 * * *`   | Tous les jours à 4h00    |
| `0 */6 * * *` | Toutes les 6 heures      |
| `30 3 * * 0`  | Dimanche à 3h30          |
| `0 0 1 * *`   | Premier du mois à minuit |
