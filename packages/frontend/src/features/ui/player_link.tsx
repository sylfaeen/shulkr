import { Link } from '@tanstack/react-router';

export function PlayerLink({ serverId, name }: { serverId: string; name: string }) {
  return (
    <Link
      to={`/app/servers/${serverId}/players/${encodeURIComponent(name)}`}
      className={
        'font-medium text-zinc-900 underline decoration-dotted underline-offset-2 hover:text-emerald-600 dark:text-zinc-100 dark:hover:text-emerald-400'
      }
    >
      {name}
    </Link>
  );
}
