import { useEffect } from 'react';

export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title}` : 'shulkr';
    return () => {
      document.title = 'shulkr';
    };
  }, [title]);
}
