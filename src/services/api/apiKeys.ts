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
  namesSupported?: boolean;
  credentialTargetingSupported?: boolean;
  credentialTargetOptionsSupported?: boolean;
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

const pendingGroupUpdates = new Set<Promise<unknown>>();

function trackGroupUpdate<T>(request: Promise<T>): Promise<T> {
  pendingGroupUpdates.add(request);
  void request.then(
    () => { pendingGroupUpdates.delete(request); },
    () => { pendingGroupUpdates.delete(request); }
  );
  return request;
}

export const apiKeysApi = {
  // Global YAML saves must read after immediate access edits have settled.
  // Failed writes still reject to their caller and leave the server value intact.
  async waitForGroupUpdates(): Promise<void> {
    while (pendingGroupUpdates.size > 0) {
      await Promise.allSettled(pendingGroupUpdates);
    }
  },

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

  async listGroupDetails(): Promise<Pick<ApiKeyAccessSnapshot, 'groups' | 'availablePriorities' | 'namesSupported' | 'credentialTargetingSupported' | 'credentialTargetOptionsSupported'>> {
    const data = await apiClient.get<Record<string, unknown>>('/api-key-groups');
    const result: Pick<ApiKeyAccessSnapshot, 'groups' | 'availablePriorities' | 'namesSupported' | 'credentialTargetingSupported' | 'credentialTargetOptionsSupported'> = {
      groups: normalizeClientApiKeyGroups(data['api-key-groups'] ?? data.apiKeyGroups),
    };
    if ('available-priorities' in data) {
      result.availablePriorities = normalizeApiKeyPriorities(data['available-priorities']);
    }
    if ('credential-target-options-supported' in data) result.credentialTargetOptionsSupported = data['credential-target-options-supported'] === true;
    if ('credential-targeting-supported' in data) result.credentialTargetingSupported = data['credential-targeting-supported'] === true;
    if ('names-supported' in data) result.namesSupported = data['names-supported'] === true;
    return result;
  },

  async getAccessSnapshot(): Promise<ApiKeyAccessSnapshot> {
    const [details, groups] = await Promise.all([apiKeysApi.listDetails(), apiKeysApi.listGroupDetails()]);
    return { ...details, ...groups };
  },

  updateGroup: (apiKey: string, providers: string[]) =>
    trackGroupUpdate(apiClient.patch('/api-key-groups', {
      'api-key': apiKey,
      providers: normalizeProviders(providers),
    })),

  updatePriorities: (apiKey: string, field: 'allowedPriorities' | 'excludedPriorities', values: number[]) =>
    trackGroupUpdate(apiClient.patch('/api-key-groups', {
      'api-key': apiKey,
      [field === 'allowedPriorities' ? 'allowed-priorities' : 'excluded-priorities']: normalizeApiKeyPriorities(values),
    })),

  updateCredentialTargeting: (apiKey: string, enabled: boolean) =>
    trackGroupUpdate(apiClient.patch('/api-key-groups', {
      'api-key': apiKey,
      'allow-credential-targeting': enabled,
    })),

  updateCredentialTargetOption: (apiKey: string, field: 'credentialTargetRespectStatePolicy' | 'credentialTargetRespectRequestLimit' | 'credentialTargetResponseModelRewrite', enabled: boolean) =>
    trackGroupUpdate(apiClient.patch('/api-key-groups', {
      'api-key': apiKey,
      [field === 'credentialTargetRespectStatePolicy' ? 'credential-target-respect-state-policy' : field === 'credentialTargetRespectRequestLimit' ? 'credential-target-respect-request-limit' : 'credential-target-response-model-rewrite']: enabled,
    })),

  deleteGroup: (apiKey: string) =>
    trackGroupUpdate(apiClient.delete(`/api-key-groups?api-key=${encodeURIComponent(apiKey)}`)),

  replace: (keys: string[]) => apiClient.put('/api-keys', keys),

  update: (index: number, value: string) => apiClient.patch('/api-keys', { index, value }),

  delete: (index: number) => apiClient.delete(`/api-keys?index=${index}`)
};
