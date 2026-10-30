import { useEffect, useState } from 'react';
import { apiClient } from '@/services/api/client';
import { useAuthStore } from '@/stores';
import type { TrafficOverview, TrafficSnapshot } from './types';

// A single timer per visible page; requests never overlap and are cancelled on navigation.
export function useTraffic<T>(
  path: string,
  body?: { ids: string[] },
  enabled = true,
  once = false
) {
  const connectionKey = useAuthStore(
    (s) => `${s.apiBase}:${s.managementAccessPath}:${s.connectionGeneration ?? 0}`
  );
  const bodyKey = body ? JSON.stringify(body) : '';
  const key = `${connectionKey}:${path}:${bodyKey}`;
  const [state, setState] = useState<{
    key: string;
    data?: T;
    stale: boolean;
    unsupported: boolean;
  }>({ key, stale: false, unsupported: false });
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    let unsupported = false;
    const connection = apiClient.captureConnection();
    const poll = async () => {
      if (stopped || document.hidden || unsupported) return;
      controller?.abort();
      const request = new AbortController();
      controller = request;
      try {
        let data: T;
        if (bodyKey) {
          const ids = (JSON.parse(bodyKey) as { ids: string[] }).ids;
          const items: TrafficSnapshot[] = [];
          for (let offset = 0; offset < ids.length; offset += 200) {
            const response = await apiClient.postAtConnection<{ items: TrafficSnapshot[] }>(
              connection,
              path,
              { ids: ids.slice(offset, offset + 200) },
              { signal: request.signal }
            );
            if (!Array.isArray(response?.items))
              throw Object.assign(new Error('Unsupported traffic snapshot'), { status: 501 });
            items.push(...response.items);
          }
          data = { items } as T;
        } else
          data = await apiClient.getAtConnection<T>(connection, path, { signal: request.signal });
        if (path.startsWith('/usage/traffic')) {
          const overview = data as unknown as TrafficOverview;
          if (
            !overview ||
            !Array.isArray(overview.items) ||
            !Number.isFinite(overview.active) ||
            !Number.isFinite(overview.rpm) ||
            typeof overview.as_of !== 'string' ||
            typeof overview.started_at !== 'string'
          )
            throw Object.assign(new Error('Unsupported traffic overview'), { status: 501 });
        }
        if (!stopped && !request.signal.aborted)
          setState({ key, data, stale: false, unsupported: false });
      } catch (error) {
        if (stopped || request.signal.aborted) return;
        unsupported = [404, 405, 501].includes(Number((error as { status?: number })?.status));
        setState((previous) => ({
          key,
          data: previous.key === key ? previous.data : undefined,
          stale: true,
          unsupported,
        }));
      } finally {
        if (!once && !stopped && !document.hidden && !unsupported && !request.signal.aborted)
          timer = setTimeout(poll, 3000);
      }
    };
    const visibility = () => {
      clearTimeout(timer);
      controller?.abort();
      if (!document.hidden) void poll();
    };
    void poll();
    document.addEventListener('visibilitychange', visibility);
    return () => {
      stopped = true;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [key, path, bodyKey, enabled, once]);
  return state.key === key ? state : { key, data: undefined, stale: false, unsupported: false };
}
export function useTrafficBatch(kind: 'auth-files' | 'api-keys', ids: string[], enabled = true) {
  const result = useTraffic<{ items: TrafficSnapshot[] }>(
    `/${kind}/traffic`,
    { ids },
    enabled && ids.length > 0
  );
  return {
    ...result,
    items: Object.fromEntries((result.data?.items ?? []).map((item) => [item.id, item])),
  };
}
export function useAdmissionSupport() {
  return (
    useTraffic<{ features: { admission: boolean } }>('/admission/options', undefined, true, true)
      .data?.features?.admission === true
  );
}
export function useTrafficOverview(query: string, enabled = true) {
  return useTraffic<TrafficOverview>(`/usage/traffic?${query}`, undefined, enabled);
}
