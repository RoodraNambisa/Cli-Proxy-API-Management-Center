/** AI provider configuration types. */

import type { RequestScopedErrorRule } from './requestScopedErrors';

export interface ModelAlias {
  name: string;
  alias?: string;
  displayName?: string;
  maxContextLength?: number;
  priority?: number;
  testModel?: string;
  [key: string]: unknown;
}

export interface ApiKeyEntry {
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

export interface GeminiKeyConfig {
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

export interface ProviderKeyConfig {
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

export interface OpenAIProviderConfig {
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
