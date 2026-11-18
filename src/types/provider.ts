/** AI provider configuration types. */

import type { RequestScopedErrorRule } from './requestScopedErrors';
import type { ModelThinking } from './modelThinking';

export type ModelInputModality = 'text' | 'image' | 'audio' | 'video';

export interface ModelAlias {
  inputModalities?: ModelInputModality[];
  name: string;
  alias?: string;
  displayName?: string;
  maxContextLength?: number;
  thinking?: ModelThinking;
  isCompat?: boolean;
  priority?: number;
  testModel?: string;
  [key: string]: unknown;
}

export interface ApiKeyEntry extends ProviderManagement {
  apiKey: string;
  weight?: number;
  proxyUrl?: string;
  headers?: Record<string, string>;
  authIndex?: string;
}

export interface CloakConfig {
  mode?: string;
  strictMode?: boolean;
  sensitiveWords?: string[];
}

export interface GeminiKeyConfig extends ProviderManagement {
  apiKey: string;
  weight?: number;
  requestRetry?: number;
  requestScopedErrors?: RequestScopedErrorRule[];
  priority?: number;
  prefix?: string;
  baseUrl?: string;
  proxyUrl?: string;
  models?: ModelAlias[];
  headers?: Record<string, string>;
  excludedModels?: string[];
  authIndex?: string;
}

export interface ProviderKeyConfig extends ProviderManagement {
  proxyRegion?: import('@/features/proxyIp/ProxyRegionFields').ProxyRegion;
  apiKey: string;
  weight?: number;
  requestRetry?: number;
  requestScopedErrors?: RequestScopedErrorRule[];
  priority?: number;
  prefix?: string;
  baseUrl?: string;
  websockets?: boolean;
  alphaSearch?: boolean;
  proxyUrl?: string;
  headers?: Record<string, string>;
  models?: ModelAlias[];
  excludedModels?: string[];
  cloak?: CloakConfig;
  authIndex?: string;
}

export interface OpenAIProviderConfig extends ProviderManagement {
  name: string;
  requestRetry?: number;
  requestScopedErrors?: RequestScopedErrorRule[];
  prefix?: string;
  baseUrl: string;
  apiKeyEntries: ApiKeyEntry[];
  headers?: Record<string, string>;
  models?: ModelAlias[];
  priority?: number;
  testModel?: string;
  authIndex?: string;
  [key: string]: unknown;
}

export interface ProviderManagement {
  disabled?: boolean;
  credentialId?: string;
  revision?: string;
  channelName?: string;
  management?: Record<string, unknown>;
}
