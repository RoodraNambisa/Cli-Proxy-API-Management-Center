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
  cache_creation_tokens?: number;
  total_tokens?: number;
  [key: string]: unknown;
}

export interface UsageMeta {
  version?: string | number;
  enabled?: boolean;
  available?: boolean;
  as_of?: string;
  oldest_at?: string | null;
  newest_at?: string | null;
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

export interface UsageSummaryQuery extends UsageRangeQuery {
  include_sources?: boolean;
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
  paged?: boolean;
  page?: number;
  page_size?: number;
  q?: string;
  provider?: string | string[];
  status?: string | string[];
  sort_by?:
    | 'auth_index'
    | 'name'
    | 'provider'
    | 'status'
    | 'total_requests'
    | 'total_tokens'
    | 'last_used_at'
    | string;
  sort_order?: 'asc' | 'desc' | string;
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
  total?: number;
  pagination?: {
    enabled?: boolean;
    page?: number;
    page_size?: number;
    total_pages?: number;
  };
  [key: string]: unknown;
}

export interface UsageSourceFacet {
  value?: string;
  total_requests?: number;
  total_tokens?: number;
  last_used_at?: string | null;
}

export interface UsageFacetsQuery extends UsageRangeQuery {
  kind?: 'source';
  q?: string;
  limit?: number;
}

export interface UsageFacetsResponse {
  kind?: string;
  items?: UsageSourceFacet[];
  total?: number;
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
  items?: UsageSeriesItem[];
  series?: unknown[];
  buckets?: unknown[];
  [key: string]: unknown;
}

export interface UsageSeriesItem {
  bucket?: string;
  group?: string;
  requests?: number;
  success_count?: number;
  failure_count?: number;
  total_tokens?: number;
  tokens?: UsageTokens;
  [key: string]: unknown;
}

export type UsageHealthBucket = '15m' | 'hour' | 'day';
export type UsageHealthGroupBy = 'none' | 'auth_index' | 'source';

export interface UsageHealthQuery extends UsageRangeQuery {
  bucket?: UsageHealthBucket;
  group_by?: UsageHealthGroupBy;
  auth_index?: string | string[];
  source?: string | string[];
}

export interface UsageHealthItem {
  bucket?: string;
  group?: string;
  requests?: number;
  success_count?: number;
  failure_count?: number;
  success_rate?: number | null;
  state?: 'no_data' | 'healthy' | 'degraded' | 'unhealthy' | string;
}

export interface UsageHealthResponse {
  as_of?: string;
  from?: string;
  to?: string;
  bucket?: UsageHealthBucket;
  group_by?: UsageHealthGroupBy;
  truncated?: boolean;
  items?: UsageHealthItem[];
}

export interface UsageRatesQuery {
  window_minutes?: number;
  sparkline_minutes?: number;
}

export interface UsageRateItem {
  bucket?: string;
  requests?: number;
  total_tokens?: number;
  rpm?: number;
  tpm?: number;
}

export interface UsageRatesResponse {
  as_of?: string;
  window_minutes?: number;
  sparkline_minutes?: number;
  request_count?: number;
  token_count?: number;
  rpm?: number;
  tpm?: number;
  items?: UsageRateItem[];
}

export type UsageAggregateBucket = 'hour' | 'day';
export type UsageTokensGroupBy = 'none' | 'model' | 'api';

export interface UsageTokensQuery extends UsageRangeQuery {
  bucket?: UsageAggregateBucket;
  group_by?: UsageTokensGroupBy;
}

export type UsageTokenItem = UsageSeriesItem;

export interface UsageTokensResponse {
  as_of?: string;
  from?: string | null;
  to?: string | null;
  bucket?: UsageAggregateBucket;
  group_by?: UsageTokensGroupBy;
  truncated?: boolean;
  total_tokens?: number;
  tokens?: UsageTokens;
  items?: UsageTokenItem[];
}

export interface UsageCostsQuery extends UsageRangeQuery {
  bucket?: UsageAggregateBucket;
}

export interface UsageMoney {
  currency?: 'USD' | string;
  amount_micros?: number;
  amount?: number;
}

export interface UsageCostCoverage {
  total_requests?: number;
  priced_requests?: number;
  calculated_requests?: number;
  request_coverage?: number | null;
  calculation_request_coverage?: number | null;
  total_tokens?: number;
  priced_tokens?: number;
  calculated_tokens?: number;
  token_coverage?: number | null;
  calculation_token_coverage?: number | null;
}

export interface UsageModelCost {
  model?: string;
  priced?: boolean;
  requests?: number;
  success_count?: number;
  failure_count?: number;
  total_tokens?: number;
  calculated_requests?: number;
  calculated_tokens?: number;
  tokens?: UsageTokens;
  cost?: UsageMoney;
}

export interface UsageApiCost {
  api?: string;
  requests?: number;
  success_count?: number;
  failure_count?: number;
  total_tokens?: number;
  tokens?: UsageTokens;
  coverage?: UsageCostCoverage;
  cost?: UsageMoney;
  rounding_adjustment_micros?: number;
}

export interface UsageCostSeriesItem {
  bucket?: string;
  requests?: number;
  success_count?: number;
  failure_count?: number;
  total_tokens?: number;
  tokens?: UsageTokens;
  coverage?: UsageCostCoverage;
  cost?: UsageMoney;
  rounding_adjustment_micros?: number;
}

export interface UsageUnpricedModel {
  model?: string;
  requests?: number;
  success_count?: number;
  failure_count?: number;
  total_tokens?: number;
  tokens?: UsageTokens;
}

export interface UsageUncalculatedModel {
  model?: string;
  requests?: number;
  total_tokens?: number;
}

export interface UsageCostsResponse {
  as_of?: string;
  from?: string | null;
  to?: string | null;
  bucket?: UsageAggregateBucket;
  truncated?: boolean;
  total?: UsageMoney;
  total_tokens?: number;
  tokens?: UsageTokens;
  coverage?: UsageCostCoverage;
  by_model?: UsageModelCost[];
  by_api?: UsageApiCost[];
  series?: UsageCostSeriesItem[];
  unpriced_models?: UsageUnpricedModel[];
  uncalculated_models?: UsageUncalculatedModel[];
}

export interface UsageModelPriceConfig {
  'input-per-million': number;
  'output-per-million': number;
  'cached-input-per-million': number;
}

export type UsageModelPrices = Record<string, UsageModelPriceConfig>;

export interface UsagePricesResponse {
  models?: UsageModelPrices;
}
