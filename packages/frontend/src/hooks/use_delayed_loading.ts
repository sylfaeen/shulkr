import { useEffect, useState } from 'react';

export function useDelayedLoading(isLoading: boolean, delayMs = 200): boolean {
  const [shouldShow, setShouldShow] = useState(false);
  useEffect(() => {
    if (!isLoading) {
      setShouldShow(false);
      return;
    }
    const timer = setTimeout(() => setShouldShow(true), delayMs);
    return () => clearTimeout(timer);
  }, [isLoading, delayMs]);
  return shouldShow;
}
