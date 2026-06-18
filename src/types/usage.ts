/**
 * 使用统计相关类型
 * 基于原项目 src/modules/usage.js
 */

// 时间段类型
export type TimePeriod = 'hour' | 'day';

// 数据点
export interface DataPoint {
  timestamp: string;
  value: number;
}

// 模型使用统计
export interface ModelUsage {
  modelName: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
}

// 使用统计数据
export interface UsageStats {
  overview: {
    totalRequests: number;
    totalTokens: number;
    totalCost: number;
  };
  requestsData: {
    hour: DataPoint[];
    day: DataPoint[];
  };
  tokensData: {
    hour: DataPoint[];
    day: DataPoint[];
  };
  costData: {
    hour: DataPoint[];
    day: DataPoint[];
  };
  modelStats: ModelUsage[];
}

// 模型价格
export interface ModelPrice {
  modelName: string;
  inputPricePer1M: number;
  outputPricePer1M: number;
}

export interface UsageTokens {
  input_tokens?: number;
  output_tokens?: number;
  reasoning_tokens?: number;
  cached_tokens?: number;
  cache_tokens?: number;
  total_tokens?: number;
  [key: string]: unknown;
}

export interface UsageMeta {
  version?: string | number;
  total_requests?: number;
  success_count?: number;
  failure_count?: number;
  total_tokens?: number;
  [key: string]: unknown;
}

export interface UsageEnvelope<T = Record<string, unknown>> {
  usage?: T;
  failed_requests?: number;
  [key: string]: unknown;
}

export interface UsageRangeQuery {
  from?: string;
  to?: string;
}

export interface UsageDetailsQuery extends UsageRangeQuery {
  api?: string;
  model?: string;
  auth_index?: string | number;
  source?: string;
  client_ip?: string;
  failed?: boolean;
  offset?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc' | string;
}

export interface UsageDetailsResponse {
  items?: unknown[];
  total?: number;
  details?: unknown[];
  offset?: number;
  limit?: number;
  next_offset?: number | null;
  has_more?: boolean;
  total_matched?: number;
  [key: string]: unknown;
}

export interface UsageAuthsQuery extends UsageRangeQuery {
  auth_index?: string | number | Array<string | number>;
}

export interface UsageAuthSummary {
  auth_index?: string | number | null;
  authIndex?: string | number | null;
  id?: string;
  name?: string;
  provider?: string;
  type?: string;
  label?: string;
  status?: string;
  disabled?: boolean;
  account_type?: string;
  accountType?: string;
  account?: string;
  email?: string;
  stale?: boolean;
  total_requests?: number;
  success_count?: number;
  failure_count?: number;
  total_tokens?: number;
  tokens?: UsageTokens;
  [key: string]: unknown;
}

export interface UsageAuthsResponse {
  auths?: UsageAuthSummary[];
  [key: string]: unknown;
}

export interface UsageAuthModelsResponse {
  models?: UsageAuthSummary[];
  [key: string]: unknown;
}

export type UsageSeriesBucket = 'minute' | 'hour' | 'day';
export type UsageSeriesGroupBy = 'api' | 'model' | 'auth_index' | 'source' | 'failed';

export interface UsageSeriesQuery extends UsageRangeQuery {
  bucket?: UsageSeriesBucket;
  group_by?: UsageSeriesGroupBy;
}

export interface UsageSeriesResponse {
  items?: unknown[];
  series?: unknown[];
  buckets?: unknown[];
  [key: string]: unknown;
}
