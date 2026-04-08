import { useEffect, useRef, useState } from 'react';

export function useScrolled<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let scrollParent: HTMLElement | null = el.parentElement;
    while (scrollParent) {
      const { overflow, overflowY } = getComputedStyle(scrollParent);
      if (overflow === 'auto' || overflow === 'scroll' || overflowY === 'auto' || overflowY === 'scroll') break;
      scrollParent = scrollParent.parentElement;
    }

    if (!scrollParent) return;

    const target = scrollParent;

    const handleScroll = () => {
      setIsScrolled(target.scrollTop > 0);
    };

    target.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => target.removeEventListener('scroll', handleScroll);
  }, []);

  return { ref, isScrolled };
}
