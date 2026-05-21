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
  enableFreePlanImageModel?: boolean;
  enableNAggregation?: boolean;
  unsupportedStatusCode?: number;
  overrideUnsupportedParams?: boolean;
  overrideResponseFormatUrl?: boolean;
  responseFormatUrlDataUrl?: boolean;
  overrideTransparentBackground?: boolean;
  overrideInputFidelity?: boolean;
  streamFlushIntervalMs?: number;
  streamFlushMinBytes?: number;
}

export interface RemoteManagementConfig {
  allowRemote?: boolean;
  secretKey?: string;
  disableControlPanel?: boolean;
  accessPath?: string;
  panelGithubRepository?: string;
}

export interface PprofManagementConfig {
  profiles?: string[];
  formats?: string[];
  goToolAvailable?: boolean;
  graphvizAvailable?: boolean;
  maxSeconds?: number;
}

export interface PprofConfig {
  enable?: boolean;
  addr?: string;
  management?: PprofManagementConfig;
}

export const CODEX_CUSTOM_MODEL_GROUPS = ['free', 'plus', 'pro', 'team', 'business', 'go'] as const;

export type CodexCustomModelGroup = (typeof CODEX_CUSTOM_MODEL_GROUPS)[number];

export interface CodexCustomModelConfig {
  id: string;
  displayName?: string;
  groups: CodexCustomModelGroup[];
}

export interface Config {
  debug?: boolean;
  proxyUrl?: string;
  requestRetry?: number;
  noCooldownStatusCodes?: number[];
  quotaExceeded?: QuotaExceededConfig;
  usageStatisticsEnabled?: boolean;
  usageStatisticsPersistIntervalSeconds?: number;
  requestLog?: boolean;
  loggingToFile?: boolean;
  logsMaxTotalSizeMb?: number;
  wsAuth?: boolean;
  enableGeminiCliEndpoint?: boolean;
  forceModelPrefix?: boolean;
  remoteManagement?: RemoteManagementConfig;
  pprof?: PprofConfig;
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
  codexCustomModels?: CodexCustomModelConfig[];
  raw?: Record<string, unknown>;
}

export type RawConfigSection =
  | 'debug'
  | 'proxy-url'
  | 'request-retry'
  | 'no-cooldown-status-codes'
  | 'quota-exceeded'
  | 'usage-statistics-enabled'
  | 'usage-statistics-persist-interval-seconds'
  | 'request-log'
  | 'logging-to-file'
  | 'logs-max-total-size-mb'
  | 'ws-auth'
  | 'enable-gemini-cli-endpoint'
  | 'force-model-prefix'
  | 'remote-management'
  | 'pprof'
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
  | 'oauth-excluded-models'
  | 'codex-custom-models';

export interface ConfigCache {
  data: Config;
  timestamp: number;
}
