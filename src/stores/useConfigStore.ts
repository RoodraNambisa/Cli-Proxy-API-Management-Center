/**
 * 配置状态管理
 * 从原项目 src/core/config-service.js 迁移
 */

import { create } from 'zustand';
import type { Config } from '@/types';
import type { RawConfigSection } from '@/types/config';
import { configApi } from '@/services/api/config';
import { CACHE_EXPIRY_MS } from '@/utils/constants';

interface ConfigCache {
  data: unknown;
  timestamp: number;
}

interface ConfigState {
  config: Config | null;
  cache: Map<string, ConfigCache>;
  loading: boolean;
  error: string | null;

  // 操作
  fetchConfig: {
    (section?: undefined, forceRefresh?: boolean): Promise<Config>;
    (section: RawConfigSection, forceRefresh?: boolean): Promise<unknown>;
  };
  updateConfigValue: (section: RawConfigSection, value: unknown) => void;
  clearCache: (section?: RawConfigSection) => void;
  isCacheValid: (section?: RawConfigSection) => boolean;
}

let configRequestToken = 0;
let inFlightConfigRequest: { id: number; promise: Promise<Config> } | null = null;

const SECTION_KEYS: RawConfigSection[] = [
  'debug',
  'proxy-url',
  'request-retry',
  'max-retry-credentials',
  'max-retry-interval',
  'no-cooldown-status-codes',
  'fixed-error-cooldowns',
  'error-response-rewrites',
  'quota-exceeded',
  'usage-statistics-enabled',
  'usage-statistics-persistence-enabled',
  'usage-statistics-persist-interval-seconds',
  'usage-statistics-detail-retention-days',
  'usage-statistics-max-storage-megabytes',
  'request-log',
  'request-body-release',
  'request-body-audit',
  'logging-to-file',
  'logs-max-total-size-mb',
  'logs-retention-days',
  'ws-auth',
  'force-model-prefix',
  'remote-management',
  'codex',
  'codex-fingerprint',
  'codex-header-defaults',
  'pprof',
  'auth-maintenance',
  'images',
  'routing/strategy',
  'routing/fill-first-range',
  'routing/fill-first-per-auth-rpm',
  'routing/per-auth-request-limit',
  'routing/per-auth-request-window-minutes',
  'routing/priority-overrides',
  'routing/session-affinity',
  'routing/session-affinity-failover',
  'routing/session-affinity-ttl',
  'api-keys',
  'gemini-api-key',
  'interactions-api-key',
  'codex-api-key',
  'claude-api-key',
  'vertex-api-key',
  'openai-compatibility',
  'oauth-excluded-models',
  'codex-custom-models',
];

const extractSectionValue = (config: Config | null, section?: RawConfigSection) => {
  if (!config) return undefined;
  switch (section) {
    case 'debug':
      return config.debug;
    case 'proxy-url':
      return config.proxyUrl;
    case 'request-retry':
      return config.requestRetry;
    case 'max-retry-credentials':
      return config.maxRetryCredentials;
    case 'max-retry-interval':
      return config.maxRetryInterval;
    case 'no-cooldown-status-codes':
      return config.noCooldownStatusCodes;
    case 'fixed-error-cooldowns':
      return config.fixedErrorCooldowns;
    case 'error-response-rewrites':
      return config.errorResponseRewrites;
    case 'quota-exceeded':
      return config.quotaExceeded;
    case 'usage-statistics-enabled':
      return config.usageStatisticsEnabled;
    case 'usage-statistics-persistence-enabled':
      return config.usageStatisticsPersistenceEnabled;
    case 'usage-statistics-persist-interval-seconds':
      return config.usageStatisticsPersistIntervalSeconds;
    case 'usage-statistics-detail-retention-days':
      return config.usageStatisticsDetailRetentionDays;
    case 'usage-statistics-max-storage-megabytes':
      return config.usageStatisticsMaxStorageMegabytes;
    case 'request-log':
      return config.requestLog;
    case 'request-body-release':
      return config.requestBodyRelease;
    case 'request-body-audit':
      return config.requestBodyAudit;
    case 'logging-to-file':
      return config.loggingToFile;
    case 'logs-max-total-size-mb':
      return config.logsMaxTotalSizeMb;
    case 'logs-retention-days':
      return config.logsRetentionDays;
    case 'ws-auth':
      return config.wsAuth;
    case 'force-model-prefix':
      return config.forceModelPrefix;
    case 'remote-management':
      return config.remoteManagement;
    case 'codex':
      return config.codex;
    case 'codex-fingerprint':
      return config.codexFingerprint;
    case 'codex-header-defaults':
      return config.codexHeaderDefaults;
    case 'pprof':
      return config.pprof;
    case 'auth-maintenance':
      return config.authMaintenance;
    case 'images':
      return config.images;
    case 'routing/strategy':
      return config.routingStrategy;
    case 'routing/fill-first-range':
      return config.routingFillFirstRange;
    case 'routing/fill-first-per-auth-rpm':
      return config.routingFillFirstPerAuthRpm;
    case 'routing/per-auth-request-limit':
      return config.routingPerAuthRequestLimit;
    case 'routing/per-auth-request-window-minutes':
      return config.routingPerAuthRequestWindowMinutes;
    case 'routing/priority-overrides':
      return config.routingPriorityOverrides;
    case 'routing/session-affinity':
      return config.routingSessionAffinity;
    case 'routing/session-affinity-failover':
      return config.routingSessionAffinityFailover;
    case 'routing/session-affinity-ttl':
      return config.routingSessionAffinityTTL;
    case 'api-keys':
      return config.apiKeys;
    case 'gemini-api-key':
      return config.geminiApiKeys;
    case 'interactions-api-key':
      return config.interactionsApiKeys;
    case 'codex-api-key':
      return config.codexApiKeys;
    case 'claude-api-key':
      return config.claudeApiKeys;
    case 'vertex-api-key':
      return config.vertexApiKeys;
    case 'openai-compatibility':
      return config.openaiCompatibility;
    case 'oauth-excluded-models':
      return config.oauthExcludedModels;
    case 'codex-custom-models':
      return config.codexCustomModels;
    default:
      if (!section) return undefined;
      return config.raw?.[section];
  }
};

export const useConfigStore = create<ConfigState>((set, get) => ({
  config: null,
  cache: new Map(),
  loading: false,
  error: null,

  fetchConfig: (async (section?: RawConfigSection, forceRefresh: boolean = false) => {
    const { cache, isCacheValid } = get();

    // 检查缓存
    const cacheKey = section || '__full__';
    if (!forceRefresh && isCacheValid(section)) {
      const cached = cache.get(cacheKey);
      if (cached) {
        return cached.data;
      }
    }

    // section 缓存未命中但 full 缓存可用时，直接复用已获取到的配置，避免重复 /config 请求
    if (!forceRefresh && section && isCacheValid()) {
      const fullCached = cache.get('__full__');
      if (fullCached?.data) {
        return extractSectionValue(fullCached.data as Config, section);
      }
    }

    // 同一时刻合并多个 /config 请求（如 StrictMode 或多个页面同时触发）
    if (inFlightConfigRequest) {
      const data = await inFlightConfigRequest.promise;
      return section ? extractSectionValue(data, section) : data;
    }

    // 获取新数据
    set({ loading: true, error: null });

    const requestId = (configRequestToken += 1);
    try {
      const requestPromise = configApi.getConfig();
      inFlightConfigRequest = { id: requestId, promise: requestPromise };
      const data = await requestPromise;
      const now = Date.now();

      // 如果在请求过程中连接已被切换/登出，则忽略旧请求的结果，避免覆盖新会话的状态
      if (requestId !== configRequestToken) {
        return section ? extractSectionValue(data, section) : data;
      }

      // 更新缓存
      const newCache = new Map(cache);
      newCache.set('__full__', { data, timestamp: now });
      SECTION_KEYS.forEach((key) => {
        const value = extractSectionValue(data, key);
        if (value !== undefined) {
          newCache.set(key, { data: value, timestamp: now });
        }
      });

      set({
        config: data,
        cache: newCache,
        loading: false,
      });

      return section ? extractSectionValue(data, section) : data;
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : 'Failed to fetch config';
      if (requestId === configRequestToken) {
        set({
          error: message || 'Failed to fetch config',
          loading: false,
        });
      }
      throw error;
    } finally {
      if (inFlightConfigRequest?.id === requestId) {
        inFlightConfigRequest = null;
      }
    }
  }) as ConfigState['fetchConfig'],

  updateConfigValue: (section, value) => {
    set((state) => {
      const raw = { ...(state.config?.raw || {}) };
      raw[section] = value;
      const nextConfig: Config = { ...(state.config || {}), raw };

      switch (section) {
        case 'debug':
          nextConfig.debug = value as Config['debug'];
          break;
        case 'proxy-url':
          nextConfig.proxyUrl = value as Config['proxyUrl'];
          break;
        case 'request-retry':
          nextConfig.requestRetry = value as Config['requestRetry'];
          break;
        case 'max-retry-credentials':
          nextConfig.maxRetryCredentials = value as Config['maxRetryCredentials'];
          break;
        case 'max-retry-interval':
          nextConfig.maxRetryInterval = value as Config['maxRetryInterval'];
          break;
        case 'no-cooldown-status-codes':
          nextConfig.noCooldownStatusCodes = value as Config['noCooldownStatusCodes'];
          break;
        case 'fixed-error-cooldowns':
          nextConfig.fixedErrorCooldowns = value as Config['fixedErrorCooldowns'];
          break;
        case 'error-response-rewrites':
          nextConfig.errorResponseRewrites = value as Config['errorResponseRewrites'];
          break;
        case 'quota-exceeded':
          nextConfig.quotaExceeded = value as Config['quotaExceeded'];
          break;
        case 'usage-statistics-enabled':
          nextConfig.usageStatisticsEnabled = value as Config['usageStatisticsEnabled'];
          break;
        case 'usage-statistics-persistence-enabled':
          nextConfig.usageStatisticsPersistenceEnabled =
            value as Config['usageStatisticsPersistenceEnabled'];
          break;
        case 'usage-statistics-persist-interval-seconds':
          nextConfig.usageStatisticsPersistIntervalSeconds =
            value as Config['usageStatisticsPersistIntervalSeconds'];
          break;
        case 'usage-statistics-detail-retention-days':
          nextConfig.usageStatisticsDetailRetentionDays =
            value as Config['usageStatisticsDetailRetentionDays'];
          break;
        case 'usage-statistics-max-storage-megabytes':
          nextConfig.usageStatisticsMaxStorageMegabytes =
            value as Config['usageStatisticsMaxStorageMegabytes'];
          break;
        case 'request-log':
          nextConfig.requestLog = value as Config['requestLog'];
          break;
        case 'request-body-release':
          nextConfig.requestBodyRelease = value as Config['requestBodyRelease'];
          break;
        case 'request-body-audit':
          nextConfig.requestBodyAudit = value as Config['requestBodyAudit'];
          break;
        case 'logging-to-file':
          nextConfig.loggingToFile = value as Config['loggingToFile'];
          break;
        case 'logs-max-total-size-mb':
          nextConfig.logsMaxTotalSizeMb = value as Config['logsMaxTotalSizeMb'];
          break;
        case 'logs-retention-days':
          nextConfig.logsRetentionDays = value as Config['logsRetentionDays'];
          break;
        case 'ws-auth':
          nextConfig.wsAuth = value as Config['wsAuth'];
          break;
        case 'force-model-prefix':
          nextConfig.forceModelPrefix = value as Config['forceModelPrefix'];
          break;
        case 'remote-management':
          nextConfig.remoteManagement = value as Config['remoteManagement'];
          break;
        case 'codex':
          nextConfig.codex = value as Config['codex'];
          break;
        case 'codex-fingerprint':
          nextConfig.codexFingerprint = value as Config['codexFingerprint'];
          break;
        case 'codex-header-defaults':
          nextConfig.codexHeaderDefaults = value as Config['codexHeaderDefaults'];
          break;
        case 'pprof':
          nextConfig.pprof = value as Config['pprof'];
          break;
        case 'auth-maintenance':
          nextConfig.authMaintenance = value as Config['authMaintenance'];
          break;
        case 'images':
          nextConfig.images = value as Config['images'];
          break;
        case 'routing/strategy':
          nextConfig.routingStrategy = value as Config['routingStrategy'];
          break;
        case 'routing/fill-first-range':
          nextConfig.routingFillFirstRange = value as Config['routingFillFirstRange'];
          break;
        case 'routing/fill-first-per-auth-rpm':
          nextConfig.routingFillFirstPerAuthRpm = value as Config['routingFillFirstPerAuthRpm'];
          break;
        case 'routing/per-auth-request-limit':
          nextConfig.routingPerAuthRequestLimit = value as Config['routingPerAuthRequestLimit'];
          break;
        case 'routing/per-auth-request-window-minutes':
          nextConfig.routingPerAuthRequestWindowMinutes =
            value as Config['routingPerAuthRequestWindowMinutes'];
          break;
        case 'routing/priority-overrides':
          nextConfig.routingPriorityOverrides = value as Config['routingPriorityOverrides'];
          break;
        case 'routing/session-affinity':
          nextConfig.routingSessionAffinity = value as Config['routingSessionAffinity'];
          break;
        case 'routing/session-affinity-failover':
          nextConfig.routingSessionAffinityFailover =
            value as Config['routingSessionAffinityFailover'];
          break;
        case 'routing/session-affinity-ttl':
          nextConfig.routingSessionAffinityTTL = value as Config['routingSessionAffinityTTL'];
          break;
        case 'api-keys':
          nextConfig.apiKeys = value as Config['apiKeys'];
          break;
        case 'gemini-api-key':
          nextConfig.geminiApiKeys = value as Config['geminiApiKeys'];
          break;
        case 'interactions-api-key':
          nextConfig.interactionsApiKeys = value as Config['interactionsApiKeys'];
          break;
        case 'codex-api-key':
          nextConfig.codexApiKeys = value as Config['codexApiKeys'];
          break;
        case 'claude-api-key':
          nextConfig.claudeApiKeys = value as Config['claudeApiKeys'];
          break;
        case 'vertex-api-key':
          nextConfig.vertexApiKeys = value as Config['vertexApiKeys'];
          break;
        case 'openai-compatibility':
          nextConfig.openaiCompatibility = value as Config['openaiCompatibility'];
          break;
        case 'oauth-excluded-models':
          nextConfig.oauthExcludedModels = value as Config['oauthExcludedModels'];
          break;
        case 'codex-custom-models':
          nextConfig.codexCustomModels = value as Config['codexCustomModels'];
          break;
        default:
          break;
      }

      return { config: nextConfig };
    });

    // 清除该 section 的缓存
    get().clearCache(section);
  },

  clearCache: (section) => {
    const { cache } = get();
    const newCache = new Map(cache);

    if (section) {
      newCache.delete(section);
      // 同时清除完整配置缓存
      newCache.delete('__full__');

      // Section-level invalidation usually follows an optimistic write path. Invalidate any in-flight
      // full fetch so stale responses can't overwrite newer local changes.
      configRequestToken += 1;
      inFlightConfigRequest = null;

      set({ cache: newCache, loading: false, error: null });
      return;
    } else {
      newCache.clear();
    }

    // 清除全部缓存一般代表“切换连接/登出/全量刷新”，需要让 in-flight 的旧请求失效
    configRequestToken += 1;
    inFlightConfigRequest = null;

    set({ config: null, cache: newCache, loading: false, error: null });
  },

  isCacheValid: (section) => {
    const { cache } = get();
    const cacheKey = section || '__full__';
    const cached = cache.get(cacheKey);

    if (!cached) return false;

    return Date.now() - cached.timestamp < CACHE_EXPIRY_MS;
  },
}));
