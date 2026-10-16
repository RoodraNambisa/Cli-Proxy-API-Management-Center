import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '@/services/api/client';
import { supportsTLSTrustAnchors } from './tlsTrustAnchors';

type Status = 'loading' | 'supported' | 'unsupported' | 'error';

export function useChatGptWebTLSCapability(connectionKey: string, active: boolean): Status {
  const scope = useMemo(() => ({ connectionKey, active }), [connectionKey, active]);
  const [result, setResult] = useState<{ scope: typeof scope; status: Status } | null>(null);
  useEffect(() => {
    if (!scope.active) return;
    const controller = new AbortController();
    const connection = apiClient.captureConnection();
    void supportsTLSTrustAnchors(connection, controller.signal).then(
      (supported) => {
        if (!controller.signal.aborted)
          setResult({ scope, status: supported ? 'supported' : 'unsupported' });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        const status = (error as { status?: number })?.status;
        setResult({
          scope,
          status: status === 404 || status === 405 || status === 501 ? 'unsupported' : 'error',
        });
      }
    );
    return () => controller.abort();
  }, [scope]);
  return active && result?.scope === scope ? result.status : 'loading';
}
