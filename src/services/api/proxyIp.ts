import { apiClient, type ApiClientConnectionSnapshot } from './client';
import type { ProxyIPConfig, TimeContext } from '@/features/proxyIp/settings';
export type RegionSnapshot = {
  route_id: string;
  ip: string;
  timezone: string;
  country: string;
  suggested_language: string;
  observation_source: string;
  cache_state: string;
  cache_age_seconds: number;
  refresh_state: string;
  reason?: string;
  retry_after_seconds?: number;
  detected_at: string;
  observed_at: string;
};
export const proxyIPApi = {
  get: (connection: ApiClientConnectionSnapshot, signal?: AbortSignal) =>
    apiClient.getAtConnection<{
      config: ProxyIPConfig;
      legacy: boolean;
      capabilities: Record<string, boolean>;
    }>(connection, '/proxy-ip', { signal }),
  save: (
    connection: ApiClientConnectionSnapshot,
    config: Partial<ProxyIPConfig>,
    signal?: AbortSignal
  ) => apiClient.patchAtConnection(connection, '/proxy-ip', config, { signal }),
  status: (connection: ApiClientConnectionSnapshot, offset = 0, signal?: AbortSignal) =>
    apiClient.getAtConnection<{ entries: RegionSnapshot[]; route_count: number; ip_count: number }>(
      connection,
      '/proxy-ip/status',
      { signal, params: { offset, limit: 50 } }
    ),
  preview: (
    connection: ApiClientConnectionSnapshot,
    index: string,
    refresh = false,
    signal?: AbortSignal
  ) =>
    apiClient.postAtConnection<RegionSnapshot>(
      connection,
      `/proxy-ip/${refresh ? 'refresh' : 'preview'}`,
      { auth_index: index },
      { signal }
    ),
  timeContext: (connection: ApiClientConnectionSnapshot, signal?: AbortSignal) =>
    apiClient.getAtConnection<{ config: TimeContext; capabilities: Record<string, boolean> }>(
      connection,
      '/codex/time-context',
      { signal }
    ),
};
