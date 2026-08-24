import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * True once `sentinelRef`'s element has scrolled above the viewport (offset
 * by `headerOffsetPx`, so a sticky header covering that band of the viewport
 * doesn't count as "still visible"). False before the sentinel is reached
 * (below the viewport) and while it's on screen.
 */
export function useScrollPastSentinel<T extends HTMLElement>(
  headerOffsetPx: number,
): { sentinelRef: RefObject<T | null>; isPast: boolean } {
  const sentinelRef = useRef<T>(null);
  const [isPast, setIsPast] = useState(false);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        // setState runs in the observer's async callback, not synchronously in
        // the effect body — not a react/react-compiler EffectSetState case.
        setIsPast(!entry.isIntersecting && entry.boundingClientRect.top < 0);
      },
      { rootMargin: `-${headerOffsetPx}px 0px 0px 0px`, threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [headerOffsetPx]);

  return { sentinelRef, isPast };
}
