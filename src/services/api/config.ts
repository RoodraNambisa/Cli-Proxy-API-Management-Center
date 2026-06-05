/**
 * 配置相关 API
 */

import { apiClient } from './client';
import type { Config } from '@/types';
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

const readNumericConfigValue = (data: Record<string, unknown>, key: NumericConfigKey): number => {
  const camelKey = key.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
  const rawValue = data[key] ?? data[camelKey] ?? data.value ?? 0;
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : 0;
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
};
