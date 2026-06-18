/**
 * 使用统计相关 API
 */

import { apiClient } from './client';
import { computeKeyStats, KeyStats, normalizeAuthIndex } from '@/utils/usage';
import type {
  UsageAuthModelsResponse,
  UsageAuthsQuery,
  UsageAuthsResponse,
  UsageAuthSummary,
  UsageDetailsQuery,
  UsageDetailsResponse,
  UsageEnvelope,
  UsageMeta,
  UsageRangeQuery,
  UsageSeriesQuery,
  UsageSeriesResponse,
} from '@/types';

const USAGE_TIMEOUT_MS = 60 * 1000;
const USAGE_DETAILS_DEFAULT_LIMIT = 200;
const USAGE_DETAILS_MAX_LIMIT = 1000;

export interface UsageExportPayload {
  version?: number;
  exported_at?: string;
  usage?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface UsageImportResponse {
  added?: number;
  skipped?: number;
  total_requests?: number;
  failed_requests?: number;
  [key: string]: unknown;
}

const normalizeDetailsQuery = (query: UsageDetailsQuery = {}) => {
  const limitRaw = Number(query.limit ?? USAGE_DETAILS_DEFAULT_LIMIT);
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(Math.floor(limitRaw), USAGE_DETAILS_MAX_LIMIT)
      : USAGE_DETAILS_DEFAULT_LIMIT;
  const offsetRaw = Number(query.offset ?? 0);
  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.floor(offsetRaw) : 0;

  return {
    ...query,
    offset,
    limit,
    sort_by: query.sort_by || 'created_at',
    sort_order: query.sort_order || 'desc',
  };
};

const normalizeRangeQuery = <T extends UsageRangeQuery>(query: T = {} as T): T => {
  const params = { ...query };
  if (!params.from) delete params.from;
  if (!params.to) delete params.to;
  return params;
};

const normalizeAuthsQuery = (query: UsageAuthsQuery = {}) => {
  const params = normalizeRangeQuery(query);
  const authIndex = params.auth_index;
  if (Array.isArray(authIndex)) {
    params.auth_index = authIndex
      .map((item) => String(item).trim())
      .filter(Boolean)
      .join(',');
  }
  if (params.auth_index === '') {
    delete params.auth_index;
  }
  return params;
};

const normalizeSeriesQuery = (query: UsageSeriesQuery = {}) => ({
  ...normalizeRangeQuery(query),
  bucket: query.bucket || 'hour',
  group_by: query.group_by || 'model',
});

export const usageApi = {
  /**
   * 获取使用统计原始数据。新页面默认不调用，仅用于旧后端兼容。
   */
  getUsage: () => apiClient.get<Record<string, unknown>>('/usage', { timeout: USAGE_TIMEOUT_MS }),

  /**
   * 获取轻量元信息，用 version 判断 summary/auths 是否需要刷新
   */
  getUsageMeta: () =>
    apiClient.get<UsageEnvelope<UsageMeta>>('/usage/meta', { timeout: USAGE_TIMEOUT_MS }),

  /**
   * 获取不包含 details 的全局/API/model 汇总
   */
  getUsageSummary: (query?: UsageRangeQuery) =>
    apiClient.get<UsageEnvelope<Record<string, unknown>>>('/usage/summary', {
      timeout: USAGE_TIMEOUT_MS,
      params: normalizeRangeQuery(query),
    }),

  /**
   * 按需分页获取请求明细
   */
  getUsageDetails: (query?: UsageDetailsQuery) =>
    apiClient.get<UsageDetailsResponse>('/usage/details', {
      timeout: USAGE_TIMEOUT_MS,
      params: normalizeDetailsQuery(query),
    }),

  /**
   * 获取凭证维度汇总，包含当前零使用量凭证
   */
  getUsageAuths: (query?: UsageAuthsQuery) =>
    apiClient.get<UsageAuthsResponse>('/usage/auths', {
      timeout: USAGE_TIMEOUT_MS,
      params: normalizeAuthsQuery(query),
    }),

  /**
   * 获取时间序列汇总
   */
  getUsageSeries: (query?: UsageSeriesQuery) =>
    apiClient.get<UsageSeriesResponse>('/usage/series', {
      timeout: USAGE_TIMEOUT_MS,
      params: normalizeSeriesQuery(query),
    }),

  /**
   * 获取单个凭证汇总
   */
  getUsageAuth: (authIndex: string | number) =>
    apiClient.get<{ auth?: UsageAuthSummary } & UsageAuthSummary>(
      `/usage/auths/${encodeURIComponent(String(authIndex))}`,
      { timeout: USAGE_TIMEOUT_MS }
    ),

  /**
   * 获取单个凭证的模型维度汇总
   */
  getUsageAuthModels: (authIndex: string | number) =>
    apiClient.get<UsageAuthModelsResponse>(
      `/usage/auths/${encodeURIComponent(String(authIndex))}/models`,
      { timeout: USAGE_TIMEOUT_MS }
    ),

  /**
   * 导出使用统计快照
   */
  exportUsage: () =>
    apiClient.get<UsageExportPayload>('/usage/export', { timeout: USAGE_TIMEOUT_MS }),

  /**
   * 导入使用统计快照
   */
  importUsage: (payload: unknown) =>
    apiClient.post<UsageImportResponse>('/usage/import', payload, { timeout: USAGE_TIMEOUT_MS }),

  /**
   * 计算密钥成功/失败统计，优先使用轻量 auths 汇总。
   */
  async getKeyStats(usageData?: unknown): Promise<KeyStats> {
    let payload = usageData;
    if (!payload) {
      try {
        const response = await usageApi.getUsageAuths();
        const byAuthIndex: KeyStats['byAuthIndex'] = {};
        (response.auths ?? []).forEach((auth) => {
          const authIndex = normalizeAuthIndex(auth.auth_index ?? auth.authIndex);
          if (!authIndex) return;
          byAuthIndex[authIndex] = {
            success: Math.max(Number(auth.success_count) || 0, 0),
            failure: Math.max(Number(auth.failure_count) || 0, 0),
          };
        });
        return { bySource: {}, byAuthIndex };
      } catch {
        const response = await apiClient.get<Record<string, unknown>>('/usage', {
          timeout: USAGE_TIMEOUT_MS,
        });
        payload = response?.usage ?? response;
      }
    }
    return computeKeyStats(payload);
  },
};
