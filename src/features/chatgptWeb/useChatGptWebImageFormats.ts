import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '@/services/api/client';
import { fetchImageFormatsCapability, type ImageFormatsCapability } from './imageOutputFormats';
type Status = 'loading' | 'supported' | 'unsupported' | 'error';
export function useChatGptWebImageFormats(connectionKey: string, active: boolean) {
  const scope = useMemo(() => ({ connectionKey, active }), [connectionKey, active]);
  const [result, setResult] = useState<{
    scope: typeof scope;
    status: Status;
    data: ImageFormatsCapability | null;
  } | null>(null);
  useEffect(() => {
    if (!scope.active) return;
    const controller = new AbortController();
    void fetchImageFormatsCapability(apiClient.captureConnection(), controller.signal).then(
      (data) => {
        if (!controller.signal.aborted)
          setResult({ scope, status: data ? 'supported' : 'unsupported', data });
      },
      (error: unknown) => {
        if (!controller.signal.aborted)
          setResult({
            scope,
            status: [404, 405, 501].includes((error as { status?: number }).status ?? 0)
              ? 'unsupported'
              : 'error',
            data: null,
          });
      }
    );
    return () => controller.abort();
  }, [scope]);
  return active && result?.scope === scope ? result : { status: 'loading' as Status, data: null };
}
