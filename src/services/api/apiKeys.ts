/**
 * Client API key management.
 */

import { apiClient } from './client';
import type { ClientApiKeyGroup } from '@/types/config';
import { normalizeApiKeyPriorities, normalizeClientApiKeyGroups } from '@/utils/apiKeyGroups';

export type ApiKeyGroup = ClientApiKeyGroup;

export type ApiKeyAccessSnapshot = {
  keys: string[];
  groups: ApiKeyGroup[];
  lastUsed?: Record<string, string>;
  availablePriorities?: number[];
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

export const apiKeysApi = {
  async listDetails(): Promise<Pick<ApiKeyAccessSnapshot, 'keys' | 'lastUsed'>> {
    const data = await apiClient.get<Record<string, unknown>>('/api-keys');
    const keys = data['api-keys'] ?? data.apiKeys;
    const result: Pick<ApiKeyAccessSnapshot, 'keys' | 'lastUsed'> = {
      keys: Array.isArray(keys) ? keys.map((key) => String(key)) : [],
    };
    const usage = data['last-used'];
    if (usage && typeof usage === 'object' && !Array.isArray(usage)) {
      result.lastUsed = Object.fromEntries(
        Object.entries(usage).filter(([, value]) => typeof value === 'string' && Number.isFinite(Date.parse(value)))
      );
    }
    return result;
  },

  async list(): Promise<string[]> {
    return (await apiKeysApi.listDetails()).keys;
  },

  async listGroups(): Promise<ApiKeyGroup[]> {
    return (await apiKeysApi.listGroupDetails()).groups;
  },

  async listGroupDetails(): Promise<Pick<ApiKeyAccessSnapshot, 'groups' | 'availablePriorities'>> {
    const data = await apiClient.get<Record<string, unknown>>('/api-key-groups');
    const result: Pick<ApiKeyAccessSnapshot, 'groups' | 'availablePriorities'> = {
      groups: normalizeClientApiKeyGroups(data['api-key-groups'] ?? data.apiKeyGroups),
    };
    if ('available-priorities' in data) {
      result.availablePriorities = normalizeApiKeyPriorities(data['available-priorities']);
    }
    return result;
  },

  async getAccessSnapshot(): Promise<ApiKeyAccessSnapshot> {
    const [details, groups] = await Promise.all([apiKeysApi.listDetails(), apiKeysApi.listGroupDetails()]);
    return { ...details, ...groups };
  },

  updateGroup: (apiKey: string, providers: string[]) =>
    apiClient.patch('/api-key-groups', {
      'api-key': apiKey,
      providers: normalizeProviders(providers),
    }),

  updatePriorities: (apiKey: string, field: 'allowedPriorities' | 'excludedPriorities', values: number[]) =>
    apiClient.patch('/api-key-groups', {
      'api-key': apiKey,
      [field === 'allowedPriorities' ? 'allowed-priorities' : 'excluded-priorities']: normalizeApiKeyPriorities(values),
    }),

  deleteGroup: (apiKey: string) =>
    apiClient.delete(`/api-key-groups?api-key=${encodeURIComponent(apiKey)}`),

  replace: (keys: string[]) => apiClient.put('/api-keys', keys),

  update: (index: number, value: string) => apiClient.patch('/api-keys', { index, value }),

  delete: (index: number) => apiClient.delete(`/api-keys?index=${index}`)
};
