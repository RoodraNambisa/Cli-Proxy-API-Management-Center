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

export type FixedErrorCooldownScope = 'model' | 'auth';

export interface FixedErrorCooldownConfig {
  statusCode?: number;
  messageContains?: string;
  cooldownSeconds?: number;
  scope?: FixedErrorCooldownScope | string;
}

export interface NonRetryableErrorConfig {
  statusCode?: number;
  type?: string;
  code?: string;
  messageContains?: string;
}

export interface AuthModelExclusionConfig {
  models?: string[];
  priorities?: number[];
  keywordContains?: string[];
  disableImageGeneration?: boolean;
}

export type DisabledImageGenerationToolAction = 'remove' | 'error';

export interface DisabledImageGenerationToolErrorConfig {
  statusCode?: number;
  message?: string;
  type?: string;
  code?: string;
}

export interface RequestBodyReleaseConfig {
  enable: boolean;
  logOnly: boolean;
  afterSeconds: number;
  minBodyBytes: number;
}

export type RoutingStrategy = 'round-robin' | 'fill-first' | 'random';

export interface RoutingPriorityOverrideConfig {
  priority: number;
  strategy?: RoutingStrategy | string;
  maxRetryCredentials?: number | null;
}

export interface RequestBodyAuditErrorConfig {
  statusCode?: number;
  message?: string;
  type?: string;
  code?: string;
}

export interface RequestBodyAuditConfig {
  enable?: boolean;
  keywords?: string[];
  keywordsBase64?: string[];
  caseSensitive?: boolean;
  maxBodyBytes?: number;
  rejectOversize?: boolean;
  error?: RequestBodyAuditErrorConfig;
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

export interface NativeImageEndpointConfig {
  enabled?: boolean;
  models?: string[];
  paramRules?: string[];
  unsupportedModelStatusCode?: number;
  unsupportedModelMessage?: string;
}

export interface NativeImagesConfig {
  generations?: NativeImageEndpointConfig;
  edits?: NativeImageEndpointConfig;
}

export interface ImagesConfig {
  codexModel?: string;
  imageModel?: string;
  enableFreePlanImageModel?: boolean;
  enableNAggregation?: boolean;
  enableStreamFlush?: boolean;
  unsupportedStatusCode?: number;
  overrideUnsupportedParams?: boolean;
  overrideResponseFormatUrl?: boolean;
  responseFormatUrlDataUrl?: boolean;
  overrideTransparentBackground?: boolean;
  overrideInputFidelity?: boolean;
  streamFlushIntervalMs?: number;
  streamFlushMinBytes?: number;
  native?: NativeImagesConfig;
}

export interface StreamingConfig {
  keepaliveSeconds?: number;
  bootstrapRetries?: number;
  enableStreamFlush?: boolean;
  streamFlushIntervalMs?: number;
  streamFlushMinBytes?: number;
  trustUpstreamSSE?: boolean;
}

export interface CodexFingerprintConfig {
  ja3?: boolean;
  forceHTTP1?: boolean;
  imagesForceHTTP1?: boolean;
}

export interface CodexHeaderDefaultsConfig {
  userAgent?: string;
  betaFeatures?: string;
  originator?: string;
}

export interface CodexConfig {
  identityConfuse?: boolean;
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
  maxRetryCredentials?: number;
  maxRetryInterval?: number;
  noCooldownStatusCodes?: number[];
  fixedErrorCooldowns?: FixedErrorCooldownConfig[];
  nonRetryableErrors?: NonRetryableErrorConfig[];
  authModelExclusions?: AuthModelExclusionConfig[];
  disabledImageGenerationToolFallback?: boolean;
  disabledImageGenerationToolAction?: DisabledImageGenerationToolAction | string;
  disabledImageGenerationToolError?: DisabledImageGenerationToolErrorConfig;
  quotaExceeded?: QuotaExceededConfig;
  usageStatisticsEnabled?: boolean;
  usageStatisticsPersistIntervalSeconds?: number;
  requestLog?: boolean;
  requestBodyRelease?: RequestBodyReleaseConfig;
  requestBodyAudit?: RequestBodyAuditConfig;
  loggingToFile?: boolean;
  logsMaxTotalSizeMb?: number;
  wsAuth?: boolean;
  enableGeminiCliEndpoint?: boolean;
  forceModelPrefix?: boolean;
  remoteManagement?: RemoteManagementConfig;
  codex?: CodexConfig;
  codexFingerprint?: CodexFingerprintConfig;
  codexHeaderDefaults?: CodexHeaderDefaultsConfig;
  pprof?: PprofConfig;
  authMaintenance?: AuthMaintenanceConfig;
  images?: ImagesConfig;
  streaming?: StreamingConfig;
  routingStrategy?: string;
  routingPriorityOverrides?: RoutingPriorityOverrideConfig[];
  routingSessionAffinity?: boolean;
  routingSessionAffinityFailover?: boolean;
  routingSessionAffinityTTL?: string;
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
  | 'max-retry-credentials'
  | 'max-retry-interval'
  | 'no-cooldown-status-codes'
  | 'fixed-error-cooldowns'
  | 'quota-exceeded'
  | 'usage-statistics-enabled'
  | 'usage-statistics-persist-interval-seconds'
  | 'request-log'
  | 'request-body-release'
  | 'request-body-audit'
  | 'logging-to-file'
  | 'logs-max-total-size-mb'
  | 'ws-auth'
  | 'enable-gemini-cli-endpoint'
  | 'force-model-prefix'
  | 'remote-management'
  | 'codex'
  | 'codex-fingerprint'
  | 'codex-header-defaults'
  | 'pprof'
  | 'auth-maintenance'
  | 'images'
  | 'streaming'
  | 'routing/strategy'
  | 'routing/priority-overrides'
  | 'routing/session-affinity'
  | 'routing/session-affinity-failover'
  | 'routing/session-affinity-ttl'
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
