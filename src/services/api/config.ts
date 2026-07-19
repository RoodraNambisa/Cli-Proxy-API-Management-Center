/**
 * 配置相关 API
 */

import { apiClient } from './client';
import type {
  Config,
  RequestBodyAuditConfig,
  RequestBodyReleaseConfig,
  RoutingPriorityOverrideConfig,
} from '@/types';
import { normalizeConfigResponse } from './transformers';

type NumericConfigKey = 'request-retry' | 'max-retry-credentials' | 'max-retry-interval';

export type ProxyUrlCheckMode = 'inherit' | 'direct' | 'proxy' | 'invalid' | string;

export type ProxyUrlCheckResult = {
  ok: boolean;
  mode: ProxyUrlCheckMode;
  proxyUrl: string;
  ip: string;
  loc: string;
  http: string;
  tls: string;
  colo: string;
  elapsedMs: number | null;
  error: string;
  message: string;
};

export type ControlPanelUpdateStatus = {
  disabled: boolean;
  autoUpdateDisabled: boolean;
  localExists: boolean;
  localHash: string;
  localModifiedAt: string;
  remoteHash: string;
  remoteDigestAvailable: boolean;
  updateAvailable: boolean;
  updated: boolean;
  checkedAt: string;
  releaseUrl: string;
  assetUrl: string;
  error: string;
};

const ROUTING_PRIORITY_OVERRIDE_STRATEGIES = new Set(['round-robin', 'fill-first', 'random']);

const readNumericConfigValue = (data: Record<string, unknown>, key: NumericConfigKey): number => {
  const camelKey = key.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
  const rawValue = data[key] ?? data[camelKey] ?? data.value ?? 0;
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : 0;
};

const readNamedNumericConfigValue = (
  data: Record<string, unknown>,
  key: string,
  fallback = 0
): number => {
  const camelKey = key.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
  const rawValue = data[key] ?? data[camelKey] ?? data.value ?? fallback;
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getNumericConfig = async (key: NumericConfigKey): Promise<number> => {
  const data = await apiClient.get<Record<string, unknown>>(`/${key}`);
  return readNumericConfigValue(data, key);
};

const putNumericConfig = (key: NumericConfigKey, value: number) =>
  apiClient.put(`/${key}`, { value });

const patchNumericConfig = (key: NumericConfigKey, value: number) =>
  apiClient.patch(`/${key}`, { value });

const readString = (value: unknown): string =>
  value === undefined || value === null ? '' : String(value);

const readNumber = (value: unknown, fallback = 0): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const readBoolean = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  return Boolean(value);
};

const normalizeProxyUrlCheckResult = (data: unknown): ProxyUrlCheckResult => {
  const source =
    data && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};
  const elapsedRaw = source.elapsed_ms ?? source.elapsedMs;
  const elapsed = typeof elapsedRaw === 'number' ? elapsedRaw : Number(elapsedRaw);

  return {
    ok: Boolean(source.ok),
    mode: readString(source.mode),
    proxyUrl: readString(source['proxy-url'] ?? source.proxyUrl),
    ip: readString(source.ip),
    loc: readString(source.loc),
    http: readString(source.http),
    tls: readString(source.tls),
    colo: readString(source.colo),
    elapsedMs: Number.isFinite(elapsed) ? elapsed : null,
    error: readString(source.error),
    message: readString(source.message),
  };
};

const normalizeStringList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => readString(item).trim()).filter(Boolean);
};

const normalizeRequestBodyAudit = (value: unknown): RequestBodyAuditConfig => {
  const source =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const error =
    source.error && typeof source.error === 'object' && !Array.isArray(source.error)
      ? (source.error as Record<string, unknown>)
      : {};

  const statusCode = readNumber(error['status-code'] ?? error.statusCode, 400);
  const maxBodyBytes = readNumber(source['max-body-bytes'] ?? source.maxBodyBytes, 0);

  return {
    enable: readBoolean(source.enable),
    keywords: normalizeStringList(source.keywords),
    keywordsBase64: normalizeStringList(source['keywords-base64'] ?? source.keywordsBase64),
    caseSensitive: readBoolean(source['case-sensitive'] ?? source.caseSensitive),
    maxBodyBytes: Number.isFinite(maxBodyBytes) && maxBodyBytes > 0 ? Math.trunc(maxBodyBytes) : 0,
    rejectOversize: readBoolean(source['reject-oversize'] ?? source.rejectOversize ?? true),
    error: {
      statusCode:
        Number.isFinite(statusCode) && statusCode >= 100 && statusCode <= 599
          ? Math.trunc(statusCode)
          : 400,
      message: readString(error.message),
      type: readString(error.type),
      code: readString(error.code),
    },
  };
};

const normalizeRequestBodyAuditResponse = (data: unknown): RequestBodyAuditConfig => {
  const source =
    data && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};
  return normalizeRequestBodyAudit(source['request-body-audit'] ?? source.requestBodyAudit ?? data);
};

const normalizeRequestBodyRelease = (value: unknown): RequestBodyReleaseConfig => {
  const source =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const afterSeconds = readNumber(source['after-seconds'] ?? source.afterSeconds, 0);
  const minBodyBytes = readNumber(source['min-body-bytes'] ?? source.minBodyBytes, 0);

  return {
    enable: readBoolean(source.enable),
    logOnly: readBoolean(source['log-only'] ?? source.logOnly),
    afterSeconds: Number.isFinite(afterSeconds) && afterSeconds > 0 ? Math.trunc(afterSeconds) : 0,
    minBodyBytes: Number.isFinite(minBodyBytes) && minBodyBytes > 0 ? Math.trunc(minBodyBytes) : 0,
  };
};

const normalizeRequestBodyReleaseResponse = (data: unknown): RequestBodyReleaseConfig => {
  const source =
    data && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};
  return normalizeRequestBodyRelease(
    source['request-body-release'] ?? source.requestBodyRelease ?? data
  );
};

const serializeRequestBodyAudit = (config: RequestBodyAuditConfig): Record<string, unknown> => ({
  enable: Boolean(config.enable),
  keywords: normalizeStringList(config.keywords),
  'keywords-base64': normalizeStringList(config.keywordsBase64),
  'case-sensitive': Boolean(config.caseSensitive),
  'max-body-bytes':
    typeof config.maxBodyBytes === 'number' && Number.isFinite(config.maxBodyBytes)
      ? Math.max(0, Math.trunc(config.maxBodyBytes))
      : 0,
  'reject-oversize': Boolean(config.rejectOversize),
  error: {
    'status-code':
      typeof config.error?.statusCode === 'number' && Number.isFinite(config.error.statusCode)
        ? Math.trunc(config.error.statusCode)
        : 400,
    message: readString(config.error?.message),
    type: readString(config.error?.type),
    code: readString(config.error?.code),
  },
});

const serializeRequestBodyRelease = (
  config: RequestBodyReleaseConfig
): Record<string, unknown> => ({
  enable: Boolean(config.enable),
  'log-only': Boolean(config.logOnly),
  'after-seconds':
    typeof config.afterSeconds === 'number' && Number.isFinite(config.afterSeconds)
      ? Math.max(0, Math.trunc(config.afterSeconds))
      : 0,
  'min-body-bytes':
    typeof config.minBodyBytes === 'number' && Number.isFinite(config.minBodyBytes)
      ? Math.max(0, Math.trunc(config.minBodyBytes))
      : 0,
});

const normalizeControlPanelUpdateStatus = (data: unknown): ControlPanelUpdateStatus => {
  const source =
    data && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};

  return {
    disabled: readBoolean(source.disabled),
    autoUpdateDisabled: readBoolean(source.auto_update_disabled ?? source.autoUpdateDisabled),
    localExists: readBoolean(source.local_exists ?? source.localExists),
    localHash: readString(source.local_hash ?? source.localHash),
    localModifiedAt: readString(source.local_modified_at ?? source.localModifiedAt),
    remoteHash: readString(source.remote_hash ?? source.remoteHash),
    remoteDigestAvailable: readBoolean(
      source.remote_digest_available ?? source.remoteDigestAvailable
    ),
    updateAvailable: readBoolean(source.update_available ?? source.updateAvailable),
    updated: readBoolean(source.updated),
    checkedAt: readString(source.checked_at ?? source.checkedAt),
    releaseUrl: readString(source.release_url ?? source.releaseUrl),
    assetUrl: readString(source.asset_url ?? source.assetUrl),
    error: readString(source.error),
  };
};

const normalizeRoutingPriorityOverrides = (value: unknown): RoutingPriorityOverrideConfig[] => {
  if (!Array.isArray(value)) return [];

  return value.reduce<RoutingPriorityOverrideConfig[]>((result, item) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) return result;
    const source = item as Record<string, unknown>;
    const priority = Number(source.priority);
    if (!Number.isSafeInteger(priority)) return result;

    const strategyRaw = readString(source.strategy).trim();
    const maxRetryCredentialsRaw = Object.prototype.hasOwnProperty.call(
      source,
      'max-retry-credentials'
    )
      ? source['max-retry-credentials']
      : source.maxRetryCredentials;
    const entry: RoutingPriorityOverrideConfig = { priority };

    if (strategyRaw && ROUTING_PRIORITY_OVERRIDE_STRATEGIES.has(strategyRaw)) {
      entry.strategy = strategyRaw;
    }
    if (maxRetryCredentialsRaw === null) {
      entry.maxRetryCredentials = null;
    } else if (maxRetryCredentialsRaw !== undefined) {
      const parsed = Number(maxRetryCredentialsRaw);
      if (Number.isSafeInteger(parsed) && parsed >= 0) {
        entry.maxRetryCredentials = parsed;
      }
    }
    const fillFirstRangeRaw = Object.prototype.hasOwnProperty.call(source, 'fill-first-range')
      ? source['fill-first-range']
      : source.fillFirstRange;
    if (fillFirstRangeRaw === null) {
      entry.fillFirstRange = null;
    } else if (fillFirstRangeRaw !== undefined) {
      const parsed = Number(fillFirstRangeRaw);
      if (Number.isSafeInteger(parsed) && parsed >= 1) {
        entry.fillFirstRange = parsed;
      }
    }
    const fillFirstPerAuthRpmRaw = Object.prototype.hasOwnProperty.call(
      source,
      'fill-first-per-auth-rpm'
    )
      ? source['fill-first-per-auth-rpm']
      : source.fillFirstPerAuthRpm;
    if (fillFirstPerAuthRpmRaw === null) {
      entry.fillFirstPerAuthRpm = null;
    } else if (fillFirstPerAuthRpmRaw !== undefined) {
      const parsed = Number(fillFirstPerAuthRpmRaw);
      if (Number.isSafeInteger(parsed) && parsed >= 0) {
        entry.fillFirstPerAuthRpm = parsed;
      }
    }
    const perAuthRequestLimitRaw = Object.prototype.hasOwnProperty.call(
      source,
      'per-auth-request-limit'
    )
      ? source['per-auth-request-limit']
      : source.perAuthRequestLimit;
    if (perAuthRequestLimitRaw === null) {
      entry.perAuthRequestLimit = null;
    } else if (perAuthRequestLimitRaw !== undefined) {
      const parsed = Number(perAuthRequestLimitRaw);
      if (Number.isSafeInteger(parsed) && parsed >= 0) {
        entry.perAuthRequestLimit = parsed;
      }
    }
    const perAuthRequestWindowMinutesRaw = Object.prototype.hasOwnProperty.call(
      source,
      'per-auth-request-window-minutes'
    )
      ? source['per-auth-request-window-minutes']
      : source.perAuthRequestWindowMinutes;
    if (perAuthRequestWindowMinutesRaw === null) {
      entry.perAuthRequestWindowMinutes = null;
    } else if (perAuthRequestWindowMinutesRaw !== undefined) {
      const parsed = Number(perAuthRequestWindowMinutesRaw);
      if (Number.isSafeInteger(parsed) && parsed >= 1) {
        entry.perAuthRequestWindowMinutes = parsed;
      }
    }

    result.push(entry);
    return result;
  }, []);
};

const normalizeRoutingPriorityOverridesResponse = (
  data: unknown
): RoutingPriorityOverrideConfig[] => {
  const source =
    data && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};
  return normalizeRoutingPriorityOverrides(
    source['priority-overrides'] ?? source.priorityOverrides ?? source.value ?? data
  );
};

const serializeRoutingPriorityOverrides = (
  overrides: RoutingPriorityOverrideConfig[]
): Array<Record<string, unknown>> =>
  overrides.map((override) => {
    const entry: Record<string, unknown> = { priority: override.priority };
    if (override.strategy) entry.strategy = override.strategy;
    if (override.maxRetryCredentials !== undefined) {
      entry['max-retry-credentials'] = override.maxRetryCredentials;
    }
    if (override.fillFirstRange !== undefined) {
      entry['fill-first-range'] = override.fillFirstRange;
    }
    if (override.fillFirstPerAuthRpm !== undefined) {
      entry['fill-first-per-auth-rpm'] = override.fillFirstPerAuthRpm;
    }
    if (override.perAuthRequestLimit !== undefined) {
      entry['per-auth-request-limit'] = override.perAuthRequestLimit;
    }
    if (override.perAuthRequestWindowMinutes !== undefined) {
      entry['per-auth-request-window-minutes'] = override.perAuthRequestWindowMinutes;
    }
    return entry;
  });

export const configApi = {
  /**
   * 获取配置（会进行字段规范化）
   */
  async getConfig(): Promise<Config> {
    const raw = await apiClient.get('/config');
    return normalizeConfigResponse(raw);
  },

  /**
   * 获取原始配置（不做转换）
   */
  getRawConfig: () => apiClient.get('/config'),

  /**
   * 更新 Debug 模式
   */
  updateDebug: (enabled: boolean) => apiClient.put('/debug', { value: enabled }),

  /**
   * 更新代理 URL
   */
  updateProxyUrl: (proxyUrl: string) => apiClient.put('/proxy-url', { value: proxyUrl }),

  /**
   * 清除代理 URL
   */
  clearProxyUrl: () => apiClient.delete('/proxy-url'),

  /**
   * 检测当前已保存的全局代理
   */
  async checkSavedProxyUrl(): Promise<ProxyUrlCheckResult> {
    const data = await apiClient.get('/proxy-url/check');
    return normalizeProxyUrlCheckResult(data);
  },

  /**
   * 检测输入框内尚未保存的代理
   */
  async checkProxyUrl(proxyUrl: string): Promise<ProxyUrlCheckResult> {
    const data = await apiClient.post('/proxy-url/check', { 'proxy-url': proxyUrl });
    return normalizeProxyUrlCheckResult(data);
  },

  /**
   * 检查管理面板更新状态
   */
  async getControlPanelUpdateStatus(): Promise<ControlPanelUpdateStatus> {
    const data = await apiClient.get('/control-panel/update');
    return normalizeControlPanelUpdateStatus(data);
  },

  /**
   * 手动更新管理面板前端
   */
  async updateControlPanel(): Promise<ControlPanelUpdateStatus> {
    const data = await apiClient.post('/control-panel/update');
    return normalizeControlPanelUpdateStatus(data);
  },

  /**
   * 获取失败后额外请求轮数
   */
  getRequestRetry: () => getNumericConfig('request-retry'),

  /**
   * 更新失败后额外请求轮数
   */
  updateRequestRetry: (retryCount: number) => putNumericConfig('request-retry', retryCount),

  /**
   * PATCH 更新失败后额外请求轮数
   */
  patchRequestRetry: (retryCount: number) => patchNumericConfig('request-retry', retryCount),

  /**
   * 获取每轮最多使用凭据数
   */
  getMaxRetryCredentials: () => getNumericConfig('max-retry-credentials'),

  /**
   * 更新每轮最多使用凭据数
   */
  updateMaxRetryCredentials: (value: number) => putNumericConfig('max-retry-credentials', value),

  /**
   * PATCH 更新每轮最多使用凭据数
   */
  patchMaxRetryCredentials: (value: number) => patchNumericConfig('max-retry-credentials', value),

  /**
   * 获取冷却等待上限
   */
  getMaxRetryInterval: () => getNumericConfig('max-retry-interval'),

  /**
   * 更新冷却等待上限
   */
  updateMaxRetryInterval: (value: number) => putNumericConfig('max-retry-interval', value),

  /**
   * PATCH 更新冷却等待上限
   */
  patchMaxRetryInterval: (value: number) => patchNumericConfig('max-retry-interval', value),

  /**
   * 配额回退：切换项目
   */
  updateSwitchProject: (enabled: boolean) =>
    apiClient.put('/quota-exceeded/switch-project', { value: enabled }),

  /**
   * 配额回退：切换预览模型
   */
  updateSwitchPreviewModel: (enabled: boolean) =>
    apiClient.put('/quota-exceeded/switch-preview-model', { value: enabled }),

  /**
   * 使用统计开关
   */
  updateUsageStatistics: (enabled: boolean) =>
    apiClient.put('/usage-statistics-enabled', { value: enabled }),

  /**
   * 请求日志开关
   */
  updateRequestLog: (enabled: boolean) => apiClient.put('/request-log', { value: enabled }),

  /**
   * 获取请求体驻留释放配置
   */
  async getRequestBodyRelease(): Promise<RequestBodyReleaseConfig> {
    const data = await apiClient.get('/request-body-release');
    return normalizeRequestBodyReleaseResponse(data);
  },

  /**
   * 更新请求体驻留释放配置
   */
  async updateRequestBodyRelease(
    config: RequestBodyReleaseConfig
  ): Promise<RequestBodyReleaseConfig> {
    await apiClient.put('/request-body-release', { value: serializeRequestBodyRelease(config) });
    const data = await apiClient.get('/request-body-release');
    return normalizeRequestBodyReleaseResponse(data);
  },

  /**
   * 获取请求体关键字审核配置
   */
  async getRequestBodyAudit(): Promise<RequestBodyAuditConfig> {
    const data = await apiClient.get('/request-body-audit');
    return normalizeRequestBodyAuditResponse(data);
  },

  /**
   * 更新请求体关键字审核配置
   */
  async updateRequestBodyAudit(config: RequestBodyAuditConfig): Promise<RequestBodyAuditConfig> {
    await apiClient.put('/request-body-audit', { value: serializeRequestBodyAudit(config) });
    const data = await apiClient.get('/request-body-audit');
    return normalizeRequestBodyAuditResponse(data);
  },

  /**
   * 写日志到文件开关
   */
  updateLoggingToFile: (enabled: boolean) => apiClient.put('/logging-to-file', { value: enabled }),

  /**
   * 获取日志总大小上限（MB）
   */
  async getLogsMaxTotalSizeMb(): Promise<number> {
    const data = await apiClient.get<Record<string, unknown>>('/logs-max-total-size-mb');
    const value = data?.['logs-max-total-size-mb'] ?? data?.logsMaxTotalSizeMb ?? 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  },

  /**
   * 更新日志总大小上限（MB）
   */
  updateLogsMaxTotalSizeMb: (value: number) => apiClient.put('/logs-max-total-size-mb', { value }),

  /**
   * WebSocket 鉴权开关
   */
  updateWsAuth: (enabled: boolean) => apiClient.put('/ws-auth', { value: enabled }),

  /**
   * 获取强制模型前缀开关
   */
  async getForceModelPrefix(): Promise<boolean> {
    const data = await apiClient.get<Record<string, unknown>>('/force-model-prefix');
    return Boolean(data?.['force-model-prefix'] ?? data?.forceModelPrefix ?? false);
  },

  /**
   * 更新强制模型前缀开关
   */
  updateForceModelPrefix: (enabled: boolean) =>
    apiClient.put('/force-model-prefix', { value: enabled }),

  /**
   * 获取路由策略
   */
  async getRoutingStrategy(): Promise<string> {
    const data = await apiClient.get<Record<string, unknown>>('/routing/strategy');
    const strategy = data?.strategy ?? data?.['routing-strategy'] ?? data?.routingStrategy;
    return typeof strategy === 'string' ? strategy : 'round-robin';
  },

  /**
   * 更新路由策略
   */
  updateRoutingStrategy: (strategy: string) =>
    apiClient.put('/routing/strategy', { value: strategy }),

  /**
   * 获取 fill-first 填充范围
   */
  async getRoutingFillFirstRange(): Promise<number> {
    const data = await apiClient.get<Record<string, unknown>>('/routing/fill-first-range');
    return readNamedNumericConfigValue(data, 'fill-first-range', 1);
  },

  /**
   * 更新 fill-first 填充范围
   */
  updateRoutingFillFirstRange: (value: number) =>
    apiClient.put('/routing/fill-first-range', { value }),

  /**
   * PATCH 更新 fill-first 填充范围
   */
  patchRoutingFillFirstRange: (value: number) =>
    apiClient.patch('/routing/fill-first-range', { value }),

  /**
   * 获取 fill-first 每凭证 RPM
   */
  async getRoutingFillFirstPerAuthRpm(): Promise<number> {
    const data = await apiClient.get<Record<string, unknown>>('/routing/fill-first-per-auth-rpm');
    return readNamedNumericConfigValue(data, 'fill-first-per-auth-rpm', 0);
  },

  /**
   * 更新 fill-first 每凭证 RPM
   */
  updateRoutingFillFirstPerAuthRpm: (value: number) =>
    apiClient.put('/routing/fill-first-per-auth-rpm', { value }),

  /**
   * PATCH 更新 fill-first 每凭证 RPM
   */
  patchRoutingFillFirstPerAuthRpm: (value: number) =>
    apiClient.patch('/routing/fill-first-per-auth-rpm', { value }),

  async getRoutingPerAuthRequestLimit(): Promise<number> {
    const data = await apiClient.get<Record<string, unknown>>('/routing/per-auth-request-limit');
    return readNamedNumericConfigValue(data, 'per-auth-request-limit', 0);
  },

  updateRoutingPerAuthRequestLimit: (value: number) =>
    apiClient.put('/routing/per-auth-request-limit', { value }),

  patchRoutingPerAuthRequestLimit: (value: number) =>
    apiClient.patch('/routing/per-auth-request-limit', { value }),

  async getRoutingPerAuthRequestWindowMinutes(): Promise<number> {
    const data = await apiClient.get<Record<string, unknown>>(
      '/routing/per-auth-request-window-minutes'
    );
    return readNamedNumericConfigValue(data, 'per-auth-request-window-minutes', 1);
  },

  updateRoutingPerAuthRequestWindowMinutes: (value: number) =>
    apiClient.put('/routing/per-auth-request-window-minutes', { value }),

  patchRoutingPerAuthRequestWindowMinutes: (value: number) =>
    apiClient.patch('/routing/per-auth-request-window-minutes', { value }),

  /**
   * 获取优先级覆盖规则
   */
  async getRoutingPriorityOverrides(): Promise<RoutingPriorityOverrideConfig[]> {
    const data = await apiClient.get('/routing/priority-overrides');
    return normalizeRoutingPriorityOverridesResponse(data);
  },

  /**
   * 更新优先级覆盖规则
   */
  async updateRoutingPriorityOverrides(
    overrides: RoutingPriorityOverrideConfig[]
  ): Promise<RoutingPriorityOverrideConfig[]> {
    const data = await apiClient.put('/routing/priority-overrides', {
      value: serializeRoutingPriorityOverrides(overrides),
    });
    return normalizeRoutingPriorityOverridesResponse(data);
  },

  /**
   * PATCH 更新优先级覆盖规则
   */
  async patchRoutingPriorityOverrides(
    overrides: RoutingPriorityOverrideConfig[]
  ): Promise<RoutingPriorityOverrideConfig[]> {
    const data = await apiClient.patch('/routing/priority-overrides', {
      value: serializeRoutingPriorityOverrides(overrides),
    });
    return normalizeRoutingPriorityOverridesResponse(data);
  },
};
