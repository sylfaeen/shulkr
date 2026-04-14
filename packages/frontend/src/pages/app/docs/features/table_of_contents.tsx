import { useState, useEffect, useRef } from 'react';
import { cn } from '@shulkr/frontend/lib/cn';

type TocItem = {
  id: string;
  text: string;
};

export function TableOfContents({ content }: { content: string }) {
  const items = extractH2s(content);
  const activeId = useActiveHeading(items);

  if (items.length <= 1) return null;

  return (
    <nav className={'sticky top-8 w-56 shrink-0'}>
      <p className={'text-xs font-semibold text-zinc-900 dark:text-zinc-100'}>On this page</p>
      <ul className={'mt-3 space-y-1.5 border-l border-zinc-200 dark:border-zinc-700'}>
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth' });
              }}
              className={cn(
                '-ml-px block border-l py-0.5 pl-3 text-[13px] transition-colors',
                activeId === item.id
                  ? 'border-zinc-900 font-medium text-zinc-900 dark:border-zinc-100 dark:text-zinc-100'
                  : 'border-transparent text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300'
              )}
            >
              {item.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function extractH2s(md: string): Array<TocItem> {
  const results: Array<TocItem> = [];
  const regex = /^## (.+)$/gm;
  let match = regex.exec(md);
  while (match) {
    const text = match[1].trim();
    const id = text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-');
    results.push({ id, text });
    match = regex.exec(md);
  }
  return results;
}

function useActiveHeading(items: Array<TocItem>): string {
  const [activeId, setActiveId] = useState('');
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    if (items.length === 0) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: '0px 0px -80% 0px', threshold: 0 }
    );

    const observer = observerRef.current;

    for (const item of items) {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [items]);

  return activeId;
}
