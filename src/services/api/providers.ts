import { serializeCredentialWeight } from '@/utils/credentialWeight';
import { normalizeModelDisplayName } from '@/utils/modelDisplayName';
import { serializeModelContextLength } from '@/utils/modelContextLength';
import { normalizeModelInputModalities } from '@/utils/modelInputModalities';
import { serializeModelThinking } from '@/utils/modelThinking';
import { normalizeModelCompatibility } from '@/utils/modelCompatibility';
import { serializeCredentialRequestRetry } from '@/utils/credentialRequestRetry';
import { serializeRequestScopedErrors } from '@/utils/requestScopedErrors';
import type { RequestScopedErrorRule } from '@/types/requestScopedErrors';
/**
 * AI provider management APIs.
 */

import { apiClient } from './client';
import {
  normalizeCodexAlphaSearch,
  normalizeCodexKeyConfig,
  normalizeGeminiKeyConfig,
  normalizeOpenAIProvider,
  normalizeProviderKeyConfig,
} from './transformers';
import type {
  GeminiKeyConfig,
  OpenAIProviderConfig,
  ProviderKeyConfig,
  ApiKeyEntry,
  ModelAlias,
} from '@/types';

const serializeHeaders = (headers?: Record<string, string>) =>
  headers && Object.keys(headers).length ? headers : undefined;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const extractArrayPayload = (data: unknown, key: string): unknown[] => {
  if (Array.isArray(data)) return data;
  if (!isRecord(data)) return [];
  const candidate = data[key] ?? data.items ?? data.data ?? data;
  return Array.isArray(candidate) ? candidate : [];
};

const buildProviderDeleteQuery = (apiKey: string, baseUrl?: string) => {
  const params = new URLSearchParams();
  params.set('api-key', apiKey.trim());
  params.set('base-url', (baseUrl ?? '').trim());
  return `?${params.toString()}`;
};

const serializeModelAliases = (
  models?: ModelAlias[],
  options: { supportsCompatibility?: boolean; supportsInputModalities?: boolean } = {}
) =>
  Array.isArray(models)
    ? models
        .map((model) => {
          if (!model?.name) return null;
          const payload: Record<string, unknown> = { ...model, name: model.name };
          for (const key of ['alias', 'displayName', 'display-name', 'maxContextLength', 'max-context-length', 'testModel', 'test-model']) {
            delete payload[key];
          }
          const displayName = normalizeModelDisplayName(model.displayName);
          if (displayName !== undefined) payload['display-name'] = displayName;
          const maxContextLength = serializeModelContextLength(model.maxContextLength);
          if (maxContextLength !== undefined) payload['max-context-length'] = maxContextLength;
          if (options.supportsInputModalities) {
            const modalities = normalizeModelInputModalities(
              Object.prototype.hasOwnProperty.call(model, 'inputModalities') ? model.inputModalities : model['input-modalities']
            );
            delete payload.inputModalities;
            delete payload['input-modalities'];
            if (modalities !== undefined) payload['input-modalities'] = modalities;
          }
          const thinking = serializeModelThinking(model.thinking);
          delete payload.thinking;
          if (thinking !== undefined) payload.thinking = thinking;
          if (options.supportsCompatibility !== false) {
            const isCompat = normalizeModelCompatibility(
              Object.prototype.hasOwnProperty.call(model, 'isCompat') ? model.isCompat : model['is-compat']
            );
            delete payload.isCompat;
            delete payload['is-compat'];
            if (isCompat !== undefined) payload['is-compat'] = isCompat;
          }
          if (model.alias && model.alias !== model.name) {
            payload.alias = model.alias;
          }
          if (model.priority !== undefined) {
            payload.priority = model.priority;
          }
          if (model.testModel) {
            payload['test-model'] = model.testModel;
          }
          return payload;
        })
        .filter(Boolean)
    : undefined;

const serializeApiKeyEntry = (entry: ApiKeyEntry) => {
  const payload: Record<string, unknown> = {
    'api-key': entry.apiKey,
    weight: serializeCredentialWeight(entry.weight),
  };
  if (entry.proxyUrl) payload['proxy-url'] = entry.proxyUrl;
  const headers = serializeHeaders(entry.headers);
  if (headers) payload.headers = headers;
  return payload;
};

const serializeRequestRetryOverride = (config: { requestRetry?: number }, patch: boolean) => {
  const value = serializeCredentialRequestRetry(config.requestRetry);
  return patch && Object.prototype.hasOwnProperty.call(config, 'requestRetry')
    ? value ?? null
    : value;
};

const serializeErrorRulesOverride = (
  config: { requestScopedErrors?: RequestScopedErrorRule[] },
  patch: boolean
) => {
  const value = serializeRequestScopedErrors(config.requestScopedErrors);
  return patch && Object.prototype.hasOwnProperty.call(config, 'requestScopedErrors')
    ? value ?? null
    : value;
};

const serializeProviderKey = (config: ProviderKeyConfig, patch = false) => {
  const payload: Record<string, unknown> = {
    'api-key': config.apiKey,
    'request-retry': serializeRequestRetryOverride(config, patch),
    'request-scoped-errors': serializeErrorRulesOverride(config, patch),
    weight:
      patch && Object.prototype.hasOwnProperty.call(config, 'weight')
        ? serializeCredentialWeight(config.weight) ?? null
        : serializeCredentialWeight(config.weight),
  };
  if (config.priority !== undefined) payload.priority = config.priority;
  if (config.prefix?.trim()) payload.prefix = config.prefix.trim();
  if (config.baseUrl) payload['base-url'] = config.baseUrl;
  if (config.websockets !== undefined) payload.websockets = config.websockets;
  if (config.proxyUrl) payload['proxy-url'] = config.proxyUrl;
  const headers = serializeHeaders(config.headers);
  if (headers) payload.headers = headers;
  const models = serializeModelAliases(config.models);
  if (models && models.length) payload.models = models;
  if (config.excludedModels && config.excludedModels.length) {
    payload['excluded-models'] = config.excludedModels;
  }
  if (config.cloak) {
    const cloakPayload: Record<string, unknown> = {};
    const mode = config.cloak.mode?.trim();
    if (mode) cloakPayload.mode = mode;
    if (config.cloak.strictMode !== undefined)
      cloakPayload['strict-mode'] = config.cloak.strictMode;
    if (config.cloak.sensitiveWords && config.cloak.sensitiveWords.length) {
      cloakPayload['sensitive-words'] = config.cloak.sensitiveWords;
    }
    if (Object.keys(cloakPayload).length) {
      payload.cloak = cloakPayload;
    }
  }
  return payload;
};

const serializeCodexKey = (config: ProviderKeyConfig, patch = false) => {
  const payload = serializeProviderKey(config, patch);
  const alphaSearch = normalizeCodexAlphaSearch(config.alphaSearch);
  if (alphaSearch !== undefined) payload['alpha-search'] = alphaSearch;
  return payload;
};

const serializeVertexModelAliases = (models?: ModelAlias[]) =>
  Array.isArray(models)
    ? models
        .map((model) => {
          const name = typeof model?.name === 'string' ? model.name.trim() : '';
          const alias = typeof model?.alias === 'string' ? model.alias.trim() : '';
          if (!name || !alias) return null;
          const payload = serializeModelAliases([{ ...model, name, alias }])?.[0];
          return { ...payload, name, alias };
        })
        .filter(Boolean)
    : undefined;

const serializeVertexKey = (config: ProviderKeyConfig, patch = false) => {
  const payload: Record<string, unknown> = {
    'api-key': config.apiKey,
    'request-retry': serializeRequestRetryOverride(config, patch),
    'request-scoped-errors': serializeErrorRulesOverride(config, patch),
    weight:
      patch && Object.prototype.hasOwnProperty.call(config, 'weight')
        ? serializeCredentialWeight(config.weight) ?? null
        : serializeCredentialWeight(config.weight),
  };
  if (config.priority !== undefined) payload.priority = config.priority;
  if (config.prefix?.trim()) payload.prefix = config.prefix.trim();
  if (config.baseUrl) payload['base-url'] = config.baseUrl;
  if (config.proxyUrl) payload['proxy-url'] = config.proxyUrl;
  const headers = serializeHeaders(config.headers);
  if (headers) payload.headers = headers;
  const models = serializeVertexModelAliases(config.models);
  if (models && models.length) payload.models = models;
  if (config.excludedModels && config.excludedModels.length) {
    payload['excluded-models'] = config.excludedModels;
  }
  return payload;
};

const serializeGeminiKey = (config: GeminiKeyConfig, patch = false) => {
  const payload: Record<string, unknown> = {
    'api-key': config.apiKey,
    'request-retry': serializeRequestRetryOverride(config, patch),
    'request-scoped-errors': serializeErrorRulesOverride(config, patch),
    weight:
      patch && Object.prototype.hasOwnProperty.call(config, 'weight')
        ? serializeCredentialWeight(config.weight) ?? null
        : serializeCredentialWeight(config.weight),
  };
  if (config.priority !== undefined) payload.priority = config.priority;
  if (config.prefix?.trim()) payload.prefix = config.prefix.trim();
  if (config.baseUrl) payload['base-url'] = config.baseUrl;
  if (config.proxyUrl) payload['proxy-url'] = config.proxyUrl;
  const headers = serializeHeaders(config.headers);
  if (headers) payload.headers = headers;
  const models = serializeModelAliases(config.models);
  if (models && models.length) payload.models = models;
  if (config.excludedModels && config.excludedModels.length) {
    payload['excluded-models'] = config.excludedModels;
  }
  return payload;
};

const serializeOpenAIProvider = (provider: OpenAIProviderConfig, patch = false) => {
  const payload: Record<string, unknown> = {
    name: provider.name,
    'request-retry': serializeRequestRetryOverride(provider, patch),
    'request-scoped-errors': serializeErrorRulesOverride(provider, patch),
    'base-url': provider.baseUrl,
    'api-key-entries': Array.isArray(provider.apiKeyEntries)
      ? provider.apiKeyEntries.map((entry) => serializeApiKeyEntry(entry))
      : [],
  };
  if (provider.prefix?.trim()) payload.prefix = provider.prefix.trim();
  const headers = serializeHeaders(provider.headers);
  if (headers) payload.headers = headers;
  const models = serializeModelAliases(provider.models, { supportsCompatibility: false, supportsInputModalities: true });
  if (models && models.length) payload.models = models;
  if (provider.priority !== undefined) payload.priority = provider.priority;
  if (provider.testModel) payload['test-model'] = provider.testModel;
  return payload;
};

export const providersApi = {
  async getGeminiKeys(): Promise<GeminiKeyConfig[]> {
    const data = await apiClient.get('/gemini-api-key');
    const list = extractArrayPayload(data, 'gemini-api-key');
    return list.map((item) => normalizeGeminiKeyConfig(item)).filter(Boolean) as GeminiKeyConfig[];
  },

  saveGeminiKeys: (configs: GeminiKeyConfig[]) =>
    apiClient.put(
      '/gemini-api-key',
      configs.map((item) => serializeGeminiKey(item))
    ),

  updateGeminiKey: (index: number, value: GeminiKeyConfig) =>
    apiClient.patch('/gemini-api-key', { index, value: serializeGeminiKey(value, true) }),

  deleteGeminiKey: (apiKey: string, baseUrl?: string) =>
    apiClient.delete(`/gemini-api-key${buildProviderDeleteQuery(apiKey, baseUrl)}`),

  async getInteractionsKeys(): Promise<GeminiKeyConfig[]> {
    const data = await apiClient.get('/interactions-api-key');
    const list = extractArrayPayload(data, 'interactions-api-key');
    return list.map((item) => normalizeGeminiKeyConfig(item)).filter(Boolean) as GeminiKeyConfig[];
  },

  saveInteractionsKeys: (configs: GeminiKeyConfig[]) =>
    apiClient.put(
      '/interactions-api-key',
      configs.map((item) => serializeGeminiKey(item))
    ),

  updateInteractionsKey: (index: number, value: GeminiKeyConfig) =>
    apiClient.patch('/interactions-api-key', { index, value: serializeGeminiKey(value, true) }),

  deleteInteractionsKey: (apiKey: string, baseUrl?: string) =>
    apiClient.delete(`/interactions-api-key${buildProviderDeleteQuery(apiKey, baseUrl)}`),

  async getCodexConfigs(): Promise<ProviderKeyConfig[]> {
    const data = await apiClient.get('/codex-api-key');
    const list = extractArrayPayload(data, 'codex-api-key');
    return list
      .map((item) => normalizeCodexKeyConfig(item))
      .filter(Boolean) as ProviderKeyConfig[];
  },

  saveCodexConfigs: (configs: ProviderKeyConfig[]) =>
    apiClient.put(
      '/codex-api-key',
      configs.map((item) => serializeCodexKey(item))
    ),

  updateCodexConfig: (index: number, value: ProviderKeyConfig) =>
    apiClient.patch('/codex-api-key', { index, value: serializeCodexKey(value, true) }),

  deleteCodexConfig: (apiKey: string, baseUrl?: string) =>
    apiClient.delete(`/codex-api-key${buildProviderDeleteQuery(apiKey, baseUrl)}`),

  async getClaudeConfigs(): Promise<ProviderKeyConfig[]> {
    const data = await apiClient.get('/claude-api-key');
    const list = extractArrayPayload(data, 'claude-api-key');
    return list
      .map((item) => normalizeProviderKeyConfig(item))
      .filter(Boolean) as ProviderKeyConfig[];
  },

  saveClaudeConfigs: (configs: ProviderKeyConfig[]) =>
    apiClient.put(
      '/claude-api-key',
      configs.map((item) => serializeProviderKey(item))
    ),

  updateClaudeConfig: (index: number, value: ProviderKeyConfig) =>
    apiClient.patch('/claude-api-key', { index, value: serializeProviderKey(value, true) }),

  deleteClaudeConfig: (apiKey: string, baseUrl?: string) =>
    apiClient.delete(`/claude-api-key${buildProviderDeleteQuery(apiKey, baseUrl)}`),

  async getVertexConfigs(): Promise<ProviderKeyConfig[]> {
    const data = await apiClient.get('/vertex-api-key');
    const list = extractArrayPayload(data, 'vertex-api-key');
    return list
      .map((item) => normalizeProviderKeyConfig(item, { preserveMatchingAliases: true }))
      .filter(Boolean) as ProviderKeyConfig[];
  },

  saveVertexConfigs: (configs: ProviderKeyConfig[]) =>
    apiClient.put(
      '/vertex-api-key',
      configs.map((item) => serializeVertexKey(item))
    ),

  updateVertexConfig: (index: number, value: ProviderKeyConfig) =>
    apiClient.patch('/vertex-api-key', { index, value: serializeVertexKey(value, true) }),

  deleteVertexConfig: (apiKey: string, baseUrl?: string) =>
    apiClient.delete(`/vertex-api-key${buildProviderDeleteQuery(apiKey, baseUrl)}`),

  async getOpenAIProviders(): Promise<OpenAIProviderConfig[]> {
    const data = await apiClient.get('/openai-compatibility');
    const list = extractArrayPayload(data, 'openai-compatibility');
    return list
      .map((item) => normalizeOpenAIProvider(item))
      .filter(Boolean) as OpenAIProviderConfig[];
  },

  saveOpenAIProviders: (providers: OpenAIProviderConfig[]) =>
    apiClient.put(
      '/openai-compatibility',
      providers.map((item) => serializeOpenAIProvider(item))
    ),

  updateOpenAIProvider: (index: number, value: OpenAIProviderConfig) =>
    apiClient.patch('/openai-compatibility', { index, value: serializeOpenAIProvider(value, true) }),

  deleteOpenAIProvider: (name: string) =>
    apiClient.delete(`/openai-compatibility?name=${encodeURIComponent(name)}`),
};
