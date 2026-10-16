import { apiClient, type ApiClientConnectionSnapshot } from './client';
import type { ProxyIPConfig, TimeContext } from '@/features/proxyIp/settings';
export type RegionSnapshot = {
  application?: ProxyRegionApplication;
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
  last_failure?: string;
  next_retry?: string;
  timezone_source?: string;
  language_source?: string;
};
export const proxyIPApi = {
  credentials: (
    connection: ApiClientConnectionSnapshot,
    params: { scope: string; provider?: string; search: string; page: number; page_size: number },
    signal?: AbortSignal
  ) =>
    apiClient.getAtConnection<{
      credentials: ProxyRegionCredential[];
      pagination: RegionPagination;
    }>(connection, '/proxy-ip/credentials', { params, signal }),
  get: (connection: ApiClientConnectionSnapshot, signal?: AbortSignal) =>
    apiClient.getAtConnection<{
      config: ProxyIPConfig;
      proxy_region?: import('@/features/proxyIp/ProxyRegionFields').ProxyRegion;
      legacy: boolean;
      capabilities: Record<string, boolean>;
    }>(connection, '/proxy-ip', { signal }),
  save: (
    connection: ApiClientConnectionSnapshot,
    config: Partial<ProxyIPConfig>,
    signal?: AbortSignal
  ) => apiClient.patchAtConnection(connection, '/proxy-ip', config, { signal }),
  status: (connection: ApiClientConnectionSnapshot, offset = 0, signal?: AbortSignal) =>
    apiClient.getAtConnection<{
      entries: RegionSnapshot[];
      route_count: number;
      ip_count: number;
      counts?: Record<string, number>;
    }>(connection, '/proxy-ip/status', { signal, params: { offset, limit: 50 } }),
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

export type ProxyRegionField = {
  value: string;
  source: string;
  state: string;
  follow_proxy: boolean;
  proxy_value?: string;
  proxy_source?: string;
};
export type ProxyRegionApplication = {
  kind: 'configuration_preview';
  evaluated_at: string;
  auth_disabled: boolean;
  binding_id?: string;
  route_source?: string;
  scope?: string;
  timezone: ProxyRegionField;
  language: ProxyRegionField;
  cache_state?: string;
  refresh_state?: string;
  reason?: string;
};
export type ProxyRegionCredential = {
  auth_id: string;
  auth_index: string;
  name: string;
  provider: string;
  disabled: boolean;
  pool?: string;
  entry?: string;
  bound: boolean;
};
export type RegionPagination = {
  page: number;
  page_size: number;
  total_pages: number;
  total: number;
};
