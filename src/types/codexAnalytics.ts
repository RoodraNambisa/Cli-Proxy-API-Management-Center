export interface CodexAnalyticsFetchParams {
  authIndex: string;
  accountId?: string;
  startDate: string;
  endDate: string;
}

export interface CodexAnalyticsRawTotals {
  users?: unknown;
  threads?: unknown;
  turns?: unknown;
  credits?: unknown;
  uncached_text_input_tokens?: unknown;
  cached_text_input_tokens?: unknown;
  text_output_tokens?: unknown;
  text_total_tokens?: unknown;
  [key: string]: unknown;
}

export interface CodexAnalyticsWorkspaceClient extends CodexAnalyticsRawTotals {
  client_id?: unknown;
  clientId?: unknown;
}

export interface CodexAnalyticsWorkspaceModel {
  model?: unknown;
  credits?: unknown;
  users?: unknown;
  threads?: unknown;
  turns?: unknown;
  [key: string]: unknown;
}

export interface CodexAnalyticsDailyWorkspaceUsageCount {
  date?: unknown;
  totals?: CodexAnalyticsRawTotals;
  clients?: CodexAnalyticsWorkspaceClient[];
  models?: CodexAnalyticsWorkspaceModel[];
  [key: string]: unknown;
}

export interface CodexAnalyticsWorkspaceUsageCountsResponse {
  group_by?: unknown;
  data?: CodexAnalyticsDailyWorkspaceUsageCount[];
  [key: string]: unknown;
}

export interface CodexAnalyticsSkillUsageOverview {
  skill_name?: unknown;
  display_name?: unknown;
  skill_ids?: unknown;
  invocation_counts?: unknown;
  [key: string]: unknown;
}

export interface CodexAnalyticsDailySkillUsageMetric {
  date?: unknown;
  skill_usage_overviews?: CodexAnalyticsSkillUsageOverview[];
  [key: string]: unknown;
}

export interface CodexAnalyticsSkillUsageResponse {
  group_by?: unknown;
  data?: CodexAnalyticsDailySkillUsageMetric[];
  [key: string]: unknown;
}

export interface CodexAnalyticsPluginUsageOverview {
  plugin_name?: unknown;
  display_name?: unknown;
  plugin_id?: unknown;
  invocation_counts?: unknown;
  calls?: unknown;
  count?: unknown;
  [key: string]: unknown;
}

export interface CodexAnalyticsDailyPluginUsageMetric {
  date?: unknown;
  plugin_usage_overviews?: CodexAnalyticsPluginUsageOverview[];
  plugins?: CodexAnalyticsPluginUsageOverview[];
  [key: string]: unknown;
}

export interface CodexAnalyticsPluginUsageResponse {
  group_by?: unknown;
  data?: CodexAnalyticsDailyPluginUsageMetric[];
  [key: string]: unknown;
}

export interface CodexAnalyticsTokenUsageModel {
  model?: unknown;
  speed?: unknown;
  credits?: unknown;
  [key: string]: unknown;
}

export interface CodexAnalyticsDailyTokenUsageBreakdown {
  date?: unknown;
  product_surface_usage_values?: Record<string, unknown>;
  models?: CodexAnalyticsTokenUsageModel[];
  [key: string]: unknown;
}

export interface CodexAnalyticsTokenUsageBreakdownResponse {
  group_by?: unknown;
  units?: unknown;
  data?: CodexAnalyticsDailyTokenUsageBreakdown[];
  [key: string]: unknown;
}

export interface CodexAnalyticsMetricTotals {
  users: number;
  threads: number;
  turns: number;
  credits: number;
  uncachedTextInputTokens: number;
  cachedTextInputTokens: number;
  textOutputTokens: number;
  textTotalTokens: number;
}

export interface CodexAnalyticsSeriesDataset {
  key: string;
  label: string;
  total: number;
  values: number[];
  color: string;
}

export interface CodexAnalyticsViewModel {
  startDate: string;
  endDate: string;
  labels: string[];
  totals: CodexAnalyticsMetricTotals;
  clientSeries: CodexAnalyticsSeriesDataset[];
  surfaceSeries: CodexAnalyticsSeriesDataset[];
  modelCreditSeries: CodexAnalyticsSeriesDataset[];
  skillInvocationSeries: CodexAnalyticsSeriesDataset[];
  pluginInvocationSeries: CodexAnalyticsSeriesDataset[];
}
