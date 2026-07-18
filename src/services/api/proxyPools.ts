import type {
  ProxyBindingStatus,
  ProxyCheckResult,
  ProxyPool,
  ProxyPoolPatch,
  ProxyPoolStatus,
  ProxyRebindResult,
  ProxyRule,
} from '@/types';
import { apiClient } from './client';

export const proxyPoolsApi = {
  async getPools(): Promise<ProxyPool[]> {
    const response = await apiClient.get<{ 'proxy-pools'?: ProxyPool[] }>('/proxy-pools');
    return Array.isArray(response?.['proxy-pools']) ? response['proxy-pools'] : [];
  },

  createPool(pool: ProxyPool): Promise<{ status?: string }> {
    return apiClient.post('/proxy-pools', { value: pool });
  },

  updatePool(name: string, patch: ProxyPoolPatch): Promise<{ status?: string }> {
    return apiClient.patch(`/proxy-pools/${encodeURIComponent(name)}`, patch);
  },

  deletePool(name: string): Promise<unknown> {
    return apiClient.delete(`/proxy-pools/${encodeURIComponent(name)}`);
  },

  getPoolStatus(name: string): Promise<ProxyPoolStatus> {
    return apiClient.get(`/proxy-pools/${encodeURIComponent(name)}/status`);
  },

  async checkPool(name: string, sample = 10): Promise<ProxyCheckResult[]> {
    const response = await apiClient.post<{ results?: ProxyCheckResult[] }>(
      `/proxy-pools/${encodeURIComponent(name)}/check`,
      { sample }
    );
    return Array.isArray(response?.results) ? response.results : [];
  },

  async getRules(): Promise<ProxyRule[]> {
    const response = await apiClient.get<{ 'proxy-rules'?: ProxyRule[] }>('/proxy-rules');
    return Array.isArray(response?.['proxy-rules']) ? response['proxy-rules'] : [];
  },

  async saveRules(rules: ProxyRule[]): Promise<ProxyRule[]> {
    const response = await apiClient.put<{ 'proxy-rules'?: ProxyRule[] }>('/proxy-rules', {
      value: rules,
    });
    return Array.isArray(response?.['proxy-rules']) ? response['proxy-rules'] : rules;
  },

  async getBindings(): Promise<ProxyBindingStatus[]> {
    const response = await apiClient.get<{ bindings?: ProxyBindingStatus[] }>('/proxy-bindings');
    return Array.isArray(response?.bindings) ? response.bindings : [];
  },

  async rebind(request: {
    auth_ids?: string[];
    auth_indexes?: string[];
  }): Promise<ProxyRebindResult[]> {
    const response = await apiClient.post<{ results?: ProxyRebindResult[] }>(
      '/proxy-bindings/rebind',
      request
    );
    return Array.isArray(response?.results) ? response.results : [];
  },
};
