import { useEffect, useRef, type RefObject } from 'react';
import { useLocation } from 'react-router-dom';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';

/** Focus once per navigation, scoped to the current page rather than an outgoing transition layer. */
export function useConfigFieldFocus(root: RefObject<HTMLElement | null>, targetId: string | undefined, ready: boolean) {
  const location = useLocation();
  const layer = usePageTransitionLayer();
  const current = !layer || layer.status === 'current';
  const visited = useRef('');
  useEffect(() => {
    const request = `${location.key}:${targetId}`;
    if (!ready || !current || !targetId || visited.current === request) return;
    const timer = window.setTimeout(() => {
      const target = root.current?.querySelector<HTMLElement>(`[id="${targetId}"]`);
      if (!target) return;
      visited.current = request;
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.querySelector<HTMLElement>('input, button, select, textarea')?.focus({ preventScroll: true });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [current, location.key, ready, root, targetId]);
}
