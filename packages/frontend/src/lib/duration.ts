export type DurationStyle = 'compact' | 'precise' | 'playtime';

export function formatDuration(ms: number, style: DurationStyle = 'compact'): string {
  if (style === 'precise') {
    if (!ms || ms <= 0) return '—';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    const seconds = ms / 1000;
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    return `${(seconds / 60).toFixed(1)}min`;
  }
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const totalMinutes = Math.floor(totalSeconds / 60);
  const totalHours = Math.floor(totalMinutes / 60);
  if (style === 'playtime') {
    if (totalMinutes < 60) return `${totalMinutes} min`;
    if (totalHours < 24) return `${totalHours}h ${totalMinutes % 60}m`;
    const days = Math.floor(totalHours / 24);
    return `${days}d ${totalHours % 24}h`;
  }
  if (totalSeconds < 60) return `${totalSeconds}s`;
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const remainingMinutes = totalMinutes % 60;
  return `${totalHours}h${remainingMinutes > 0 ? `${remainingMinutes}m` : ''}`;
}

export function formatDurationSince(timestamp: number, style: DurationStyle = 'compact'): string {
  return formatDuration(Date.now() - timestamp, style);
}
