/**
 * 配置相关类型定义
 * 与基线 /config 返回结构保持一致（内部使用驼峰形式）
 */

import type { GeminiKeyConfig, ProviderKeyConfig, OpenAIProviderConfig } from './provider';
import type { AmpcodeConfig } from './ampcode';

export interface QuotaExceededConfig {
  switchProject?: boolean;
  switchPreviewModel?: boolean;
  antigravityCredits?: boolean;
}

export interface AuthMaintenanceConfig {
  enable?: boolean;
  scanIntervalSeconds?: number;
  deleteIntervalSeconds?: number;
  deleteStatusCodes?: number[];
  deleteQuotaExceeded?: boolean;
  quotaStrikeThreshold?: number;
  disableQuotaExceeded?: boolean;
  disableQuotaStrikeThreshold?: number;
}

export interface ImagesConfig {
  codexModel?: string;
  imageModel?: string;
  enableNAggregation?: boolean;
  unsupportedStatusCode?: number;
  overrideUnsupportedParams?: boolean;
}

export interface Config {
  debug?: boolean;
  proxyUrl?: string;
  requestRetry?: number;
  quotaExceeded?: QuotaExceededConfig;
  usageStatisticsEnabled?: boolean;
  usageStatisticsPersistIntervalSeconds?: number;
  requestLog?: boolean;
  loggingToFile?: boolean;
  logsMaxTotalSizeMb?: number;
  wsAuth?: boolean;
  enableGeminiCliEndpoint?: boolean;
  forceModelPrefix?: boolean;
  authMaintenance?: AuthMaintenanceConfig;
  images?: ImagesConfig;
  routingStrategy?: string;
  apiKeys?: string[];
  ampcode?: AmpcodeConfig;
  geminiApiKeys?: GeminiKeyConfig[];
  codexApiKeys?: ProviderKeyConfig[];
  claudeApiKeys?: ProviderKeyConfig[];
  vertexApiKeys?: ProviderKeyConfig[];
  openaiCompatibility?: OpenAIProviderConfig[];
  oauthExcludedModels?: Record<string, string[]>;
  raw?: Record<string, unknown>;
}

export type RawConfigSection =
  | 'debug'
  | 'proxy-url'
  | 'request-retry'
  | 'quota-exceeded'
  | 'usage-statistics-enabled'
  | 'usage-statistics-persist-interval-seconds'
  | 'request-log'
  | 'logging-to-file'
  | 'logs-max-total-size-mb'
  | 'ws-auth'
  | 'enable-gemini-cli-endpoint'
  | 'force-model-prefix'
  | 'auth-maintenance'
  | 'images'
  | 'routing/strategy'
  | 'api-keys'
  | 'ampcode'
  | 'gemini-api-key'
  | 'codex-api-key'
  | 'claude-api-key'
  | 'vertex-api-key'
  | 'openai-compatibility'
  | 'oauth-excluded-models';

export interface ConfigCache {
  data: Config;
  timestamp: number;
}
