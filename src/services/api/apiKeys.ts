/**
 * API 密钥管理
 */

import { apiClient } from './client';

export type ApiKeyGroup = {
  apiKey: string;
  providers: string[];
};

export type ApiKeyAccessSnapshot = {
  keys: string[];
  groups: ApiKeyGroup[];
};

const normalizeProviders = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const providers: string[] = [];
  value.forEach((entry) => {
    const provider = String(entry ?? '')
      .trim()
      .toLowerCase();
    if (!provider || seen.has(provider)) return;
    seen.add(provider);
    providers.push(provider);
  });
  return providers;
};

const normalizeGroups = (value: unknown): ApiKeyGroup[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const apiKey = String(record['api-key'] ?? record.apiKey ?? '').trim();
    if (!apiKey) return [];
    return [{ apiKey, providers: normalizeProviders(record.providers) }];
  });
};

export const apiKeysApi = {
  async list(): Promise<string[]> {
    const data = await apiClient.get<Record<string, unknown>>('/api-keys');
    const keys = data['api-keys'] ?? data.apiKeys;
    return Array.isArray(keys) ? keys.map((key) => String(key)) : [];
  },

  async listGroups(): Promise<ApiKeyGroup[]> {
    const data = await apiClient.get<Record<string, unknown>>('/api-key-groups');
    return normalizeGroups(data['api-key-groups'] ?? data.apiKeyGroups);
  },

  async getAccessSnapshot(): Promise<ApiKeyAccessSnapshot> {
    const [keys, groups] = await Promise.all([apiKeysApi.list(), apiKeysApi.listGroups()]);
    return { keys, groups };
  },

  updateGroup: (apiKey: string, providers: string[]) =>
    apiClient.patch('/api-key-groups', {
      'api-key': apiKey,
      providers: normalizeProviders(providers),
    }),

  deleteGroup: (apiKey: string) =>
    apiClient.delete(`/api-key-groups?api-key=${encodeURIComponent(apiKey)}`),

  replace: (keys: string[]) => apiClient.put('/api-keys', keys),

  update: (index: number, value: string) => apiClient.patch('/api-keys', { index, value }),

  delete: (index: number) => apiClient.delete(`/api-keys?index=${index}`)
};
