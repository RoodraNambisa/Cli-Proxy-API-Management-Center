/**
 * 配置相关类型定义
 * 与基线 /config 返回结构保持一致（内部使用驼峰形式）
 */

import type { GeminiKeyConfig, ProviderKeyConfig, OpenAIProviderConfig } from './provider';

export interface QuotaExceededConfig {
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

export interface ErrorResponseRewriteConfig {
  statusCode?: number;
  messageContains?: string;
  responseStatusCode?: number;
  responseBody?: Record<string, unknown>;
}

export interface AuthModelExclusionConfig {
  providers?: string[];
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

export interface RoutingSubscriptionOverrideConfig {
  providers?: string[];
  planTypes: string[];
  perAuthRequestLimit?: number | null;
  perAuthRequestWindowMinutes?: number | null;
}

export interface RoutingPriorityOverrideConfig {
  priority: number;
  strategy?: RoutingStrategy | string;
  maxRetryCredentials?: number | null;
  fillFirstRange?: number | null;
  fillFirstPerAuthRpm?: number | null;
  perAuthRequestLimit?: number | null;
  perAuthRequestWindowMinutes?: number | null;
  subscriptionOverrides?: RoutingSubscriptionOverrideConfig[];
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
  chatgptWeb?: {
    sanitizeErrorResponses?: boolean;
    normalizeMismatchedImageMime?: boolean;
    normalizeRemoteImageMime?: boolean;
    pollStallBreakerEnabled?: boolean;
    pollStallSeconds?: number;
  };
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

export const CODEX_FINGERPRINT_MODES = ['off', 'device', 'session', 'full'] as const;

export type CodexFingerprintDefaultMode = (typeof CODEX_FINGERPRINT_MODES)[number];

export const DEFAULT_CODEX_FINGERPRINT_MODE: CodexFingerprintDefaultMode = 'device';

export const DEFAULT_CODEX_SESSION_IDENTITY_POOL_SIZE = 1;
export const MIN_CODEX_SESSION_IDENTITY_POOL_SIZE = 1;
export const MAX_CODEX_SESSION_IDENTITY_POOL_SIZE = 64;

export const normalizeCodexFingerprintMode = (value: unknown): CodexFingerprintDefaultMode => {
  if (typeof value !== 'string') return DEFAULT_CODEX_FINGERPRINT_MODE;
  const normalized = value.trim().toLowerCase();
  return CODEX_FINGERPRINT_MODES.includes(normalized as CodexFingerprintDefaultMode)
    ? (normalized as CodexFingerprintDefaultMode)
    : DEFAULT_CODEX_FINGERPRINT_MODE;
};

export const normalizeCodexSessionIdentityPoolSize = (value: unknown): number => {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : Number.NaN;
  return Number.isSafeInteger(parsed) &&
    parsed >= MIN_CODEX_SESSION_IDENTITY_POOL_SIZE &&
    parsed <= MAX_CODEX_SESSION_IDENTITY_POOL_SIZE
    ? parsed
    : DEFAULT_CODEX_SESSION_IDENTITY_POOL_SIZE;
};

export interface CodexFingerprintConfig {
  ja3?: boolean;
  forceHTTP1?: boolean;
  imagesForceHTTP1?: boolean;
  sessionIdentityPoolSize?: number;
  defaultMode?: CodexFingerprintDefaultMode;
}

export interface CodexHeaderDefaultsConfig {
  userAgent?: string;
  betaFeatures?: string;
  originator?: string;
}

export const CODEX_TURN_STATE_POLICIES = [
  'passthrough',
  'guard-cross-account',
  'same-account-only',
  'strip',
] as const;

export type CodexTurnStatePolicy = (typeof CODEX_TURN_STATE_POLICIES)[number];

export const DEFAULT_CODEX_TURN_STATE_POLICY: CodexTurnStatePolicy = 'guard-cross-account';

export const normalizeCodexTurnStatePolicy = (value: unknown): CodexTurnStatePolicy => {
  if (typeof value !== 'string') return DEFAULT_CODEX_TURN_STATE_POLICY;
  const normalized = value.trim().toLowerCase();
  return CODEX_TURN_STATE_POLICIES.includes(normalized as CodexTurnStatePolicy)
    ? (normalized as CodexTurnStatePolicy)
    : DEFAULT_CODEX_TURN_STATE_POLICY;
};

export interface CodexConfig {
  identityConfuse?: boolean;
  spoofSessionIdentity?: boolean;
  turnStatePolicy?: CodexTurnStatePolicy;
  enforceSoftwareIdentity?: boolean;
}

export interface RemoteManagementConfig {
  allowRemote?: boolean;
  secretKey?: string;
  disableControlPanel?: boolean;
  accessPath?: string;
  panelGithubRepository?: string;
  authFilesPagination?: {
    enabled?: boolean;
  };
  liveLogs?: {
    enabled?: boolean;
  };
  diagnostics?: {
    detailLevel?: 'safe' | 'full' | string;
  };
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
  errorResponseRewrites?: ErrorResponseRewriteConfig[];
  nonRetryableErrors?: NonRetryableErrorConfig[];
  authModelExclusions?: AuthModelExclusionConfig[];
  disabledImageGenerationToolFallback?: boolean;
  disabledImageGenerationToolAction?: DisabledImageGenerationToolAction | string;
  disabledImageGenerationToolError?: DisabledImageGenerationToolErrorConfig;
  quotaExceeded?: QuotaExceededConfig;
  usageStatisticsEnabled?: boolean;
  usageStatisticsPersistenceEnabled?: boolean;
  usageStatisticsPersistIntervalSeconds?: number;
  usageStatisticsDetailRetentionDays?: number;
  usageStatisticsMaxStorageMegabytes?: number;
  requestLog?: boolean;
  requestBodyRelease?: RequestBodyReleaseConfig;
  requestBodyAudit?: RequestBodyAuditConfig;
  loggingToFile?: boolean;
  logsMaxTotalSizeMb?: number;
  logsRetentionDays?: number;
  wsAuth?: boolean;
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
  routingFillFirstRange?: number;
  routingFillFirstPerAuthRpm?: number;
  routingPerAuthRequestLimit?: number;
  routingPerAuthRequestWindowMinutes?: number;
  routingPriorityOverrides?: RoutingPriorityOverrideConfig[];
  routingSessionAffinity?: boolean;
  routingSessionAffinityFailover?: boolean;
  routingSessionAffinityTTL?: string;
  apiKeys?: string[];
  geminiApiKeys?: GeminiKeyConfig[];
  interactionsApiKeys?: GeminiKeyConfig[];
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
  | 'error-response-rewrites'
  | 'quota-exceeded'
  | 'usage-statistics-enabled'
  | 'usage-statistics-persistence-enabled'
  | 'usage-statistics-persist-interval-seconds'
  | 'usage-statistics-detail-retention-days'
  | 'usage-statistics-max-storage-megabytes'
  | 'request-log'
  | 'request-body-release'
  | 'request-body-audit'
  | 'logging-to-file'
  | 'logs-max-total-size-mb'
  | 'logs-retention-days'
  | 'ws-auth'
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
  | 'routing/fill-first-range'
  | 'routing/fill-first-per-auth-rpm'
  | 'routing/per-auth-request-limit'
  | 'routing/per-auth-request-window-minutes'
  | 'routing/priority-overrides'
  | 'routing/session-affinity'
  | 'routing/session-affinity-failover'
  | 'routing/session-affinity-ttl'
  | 'api-keys'
  | 'gemini-api-key'
  | 'interactions-api-key'
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
