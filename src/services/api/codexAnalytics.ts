import type {
  CodexAnalyticsDailyPluginUsageMetric,
  CodexAnalyticsDailySkillUsageMetric,
  CodexAnalyticsDailyTokenUsageBreakdown,
  CodexAnalyticsDailyWorkspaceUsageCount,
  CodexAnalyticsFetchParams,
  CodexAnalyticsMetricTotals,
  CodexAnalyticsPluginUsageResponse,
  CodexAnalyticsSeriesDataset,
  CodexAnalyticsSkillUsageResponse,
  CodexAnalyticsTokenUsageBreakdownResponse,
  CodexAnalyticsViewModel,
  CodexAnalyticsWorkspaceUsageCountsResponse,
} from '@/types';
import { CODEX_REQUEST_HEADERS } from '@/utils/quota/constants';
import { createStatusError } from '@/utils/quota/formatters';
import { apiCallApi, getApiCallErrorMessage, type ApiCallResult } from './apiCall';

const CHATGPT_BASE_URL = 'https://chatgpt.com';
const DAILY_SKILL_USAGE_URL = `${CHATGPT_BASE_URL}/backend-api/wham/analytics/daily-skill-usage-metrics`;
const DAILY_PLUGIN_USAGE_URL = `${CHATGPT_BASE_URL}/backend-api/wham/analytics/daily-plugin-usage-metrics`;
const DAILY_WORKSPACE_USAGE_URL = `${CHATGPT_BASE_URL}/backend-api/wham/analytics/daily-workspace-usage-counts`;
const DAILY_TOKEN_BREAKDOWN_URL = `${CHATGPT_BASE_URL}/backend-api/wham/usage/daily-token-usage-breakdown`;

const SERIES_COLORS = [
  '#ef4444',
  '#ec4899',
  '#3b82f6',
  '#22c55e',
  '#f59e0b',
  '#8b5cf6',
  '#14b8a6',
  '#64748b',
  '#f97316',
  '#06b6d4',
  '#84cc16',
  '#a855f7',
];

const SURFACE_LABELS: Record<string, string> = {
  desktop_app: 'Desktop App',
  CODEX_DESKTOP_APP: 'Desktop App',
  cli: 'CLI',
  CODEX_CLI: 'CLI',
  vscode: 'VS Code',
  web: 'Web',
  mobile: 'Mobile',
  slack: 'Slack',
  linear: 'Linear',
  jetbrains: 'JetBrains',
  sdk: 'SDK',
  exec: 'Exec',
  github: 'GitHub',
  github_code_review: 'GitHub Code Review',
  agent_identity: 'Agent Identity',
  unknown: 'Unknown',
};

const emptyTotals = (): CodexAnalyticsMetricTotals => ({
  users: 0,
  threads: 0,
  turns: 0,
  credits: 0,
  uncachedTextInputTokens: 0,
  cachedTextInputTokens: 0,
  textOutputTokens: 0,
  textTotalTokens: 0,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const toNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const toStringValue = (value: unknown): string => {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).trim();
};

const formatLocalDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const readDate = (value: unknown): string | null => {
  const date = toStringValue(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
};

const addTotals = (
  target: CodexAnalyticsMetricTotals,
  source: Record<string, unknown> | undefined
) => {
  if (!source) return;
  target.users += toNumber(source.users);
  target.threads += toNumber(source.threads);
  target.turns += toNumber(source.turns);
  target.credits += toNumber(source.credits);
  target.uncachedTextInputTokens += toNumber(source.uncached_text_input_tokens);
  target.cachedTextInputTokens += toNumber(source.cached_text_input_tokens);
  target.textOutputTokens += toNumber(source.text_output_tokens);
  target.textTotalTokens += toNumber(source.text_total_tokens);
};

const buildDateLabels = (startDate: string, endDate: string): string[] => {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return [];
  }

  const labels: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end && labels.length < 732) {
    labels.push(formatLocalDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return labels;
};

const buildUrl = (baseUrl: string, params: Record<string, string | number | boolean>): string => {
  const url = new URL(baseUrl);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, String(value));
  });
  return url.toString();
};

const requestJson = async <T>(
  authIndex: string,
  url: string,
  accountId?: string
): Promise<T> => {
  const headers: Record<string, string> = {
    ...CODEX_REQUEST_HEADERS,
    Accept: 'application/json',
  };
  if (accountId) {
    headers['Chatgpt-Account-Id'] = accountId;
  }

  const result = await apiCallApi.request({
    authIndex,
    method: 'GET',
    url,
    header: headers,
  });

  return parseApiResult<T>(result, url);
};

const parseApiResult = <T>(result: ApiCallResult, url: string): T => {
  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw createStatusError(`${url}: ${getApiCallErrorMessage(result)}`, result.statusCode);
  }
  if (result.body === null || result.body === undefined) {
    return {} as T;
  }
  return result.body as T;
};

const collectLabels = (
  labels: string[],
  ...groups: Array<Array<{ date?: unknown } | undefined> | undefined>
): string[] => {
  const seen = new Set(labels);
  groups.forEach((records) => {
    records?.forEach((record) => {
      const date = readDate(record?.date);
      if (date && !seen.has(date)) {
        seen.add(date);
        labels.push(date);
      }
    });
  });
  return [...labels].sort();
};

const createSeriesMap = (labels: string[]) => {
  const dateIndex = new Map(labels.map((label, index) => [label, index] as const));
  const series = new Map<
    string,
    { label: string; description?: string; rawName?: string; values: number[]; total: number }
  >();

  const addValue = (
    date: string | null,
    key: string,
    label: string,
    value: number,
    metadata?: { description?: string; rawName?: string }
  ) => {
    const index = date ? dateIndex.get(date) : undefined;
    if (index === undefined || !key || value === 0) return;
    const entry =
      series.get(key) ??
      {
        label,
        description: metadata?.description,
        rawName: metadata?.rawName,
        values: Array.from({ length: labels.length }, () => 0),
        total: 0,
      };
    entry.values[index] += value;
    entry.total += value;
    if (!entry.description && metadata?.description) {
      entry.description = metadata.description;
    }
    if (!entry.rawName && metadata?.rawName) {
      entry.rawName = metadata.rawName;
    }
    series.set(key, entry);
  };

  return { series, addValue };
};

const finalizeSeries = (
  series: Map<
    string,
    { label: string; description?: string; rawName?: string; values: number[]; total: number }
  >,
  limit?: number
): CodexAnalyticsSeriesDataset[] =>
  Array.from(series.entries())
    .map(([key, entry], index) => ({
      key,
      label: entry.label,
      description: entry.description,
      rawName: entry.rawName,
      total: entry.total,
      values: entry.values,
      color: SERIES_COLORS[index % SERIES_COLORS.length],
    }))
    .filter((entry) => entry.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, limit)
    .map((entry, index) => ({
      ...entry,
      color: SERIES_COLORS[index % SERIES_COLORS.length],
    }));

const normalizeClientMetricSeries = (
  records: CodexAnalyticsDailyWorkspaceUsageCount[],
  labels: string[],
  metricKey:
    | 'credits'
    | 'text_total_tokens'
    | 'turns'
    | 'threads'
    | 'cached_text_input_tokens'
    | 'uncached_text_input_tokens'
    | 'text_output_tokens'
): CodexAnalyticsSeriesDataset[] => {
  const { series, addValue } = createSeriesMap(labels);
  records.forEach((record) => {
    const date = readDate(record.date);
    const clients = Array.isArray(record.clients) ? record.clients : [];
    clients.forEach((client) => {
      const key = toStringValue(client.client_id ?? client.clientId);
      const label = key ? SURFACE_LABELS[key] ?? key : '';
      addValue(date, key, label, toNumber(client[metricKey]));
    });
  });
  return finalizeSeries(series);
};

const normalizeSurfacePercentSeries = (
  records: CodexAnalyticsDailyTokenUsageBreakdown[],
  labels: string[]
): CodexAnalyticsSeriesDataset[] => {
  const { series, addValue } = createSeriesMap(labels);
  records.forEach((record) => {
    const date = readDate(record.date);
    if (!isRecord(record.product_surface_usage_values)) return;
    Object.entries(record.product_surface_usage_values).forEach(([key, value]) => {
      const normalizedKey = key.trim();
      addValue(date, normalizedKey, SURFACE_LABELS[normalizedKey] ?? normalizedKey, toNumber(value));
    });
  });
  return finalizeSeries(series);
};

const modelKey = (model: unknown, speed: unknown): { key: string; label: string } => {
  const modelName = toStringValue(model) || 'unknown';
  const speedName = toStringValue(speed);
  if (!speedName || speedName === 'standard') {
    return { key: modelName, label: modelName };
  }
  return { key: `${modelName}:${speedName}`, label: `${modelName} (${speedName})` };
};

const normalizeModelPercentSeries = (
  tokenRecords: CodexAnalyticsDailyTokenUsageBreakdown[],
  labels: string[]
): CodexAnalyticsSeriesDataset[] => {
  const { series, addValue } = createSeriesMap(labels);
  tokenRecords.forEach((record) => {
    const date = readDate(record.date);
    const models = Array.isArray(record.models) ? record.models : [];
    models.forEach((model) => {
      const identity = modelKey(model.model, model.speed);
      addValue(date, identity.key, identity.label, toNumber(model.credits));
    });
  });

  return finalizeSeries(series, 10);
};

const normalizeModelMetricSeries = (
  records: CodexAnalyticsDailyWorkspaceUsageCount[],
  labels: string[],
  metricKey: 'credits' | 'turns' | 'threads'
): CodexAnalyticsSeriesDataset[] => {
  const { series, addValue } = createSeriesMap(labels);
  records.forEach((record) => {
    const date = readDate(record.date);
    const models = Array.isArray(record.models) ? record.models : [];
    models.forEach((model) => {
      const identity = modelKey(model.model, '');
      addValue(date, identity.key, identity.label, toNumber(model[metricKey]));
    });
  });
  return finalizeSeries(series, 10);
};

const normalizeTokenBreakdownSeries = (
  records: CodexAnalyticsDailyWorkspaceUsageCount[],
  labels: string[]
): CodexAnalyticsSeriesDataset[] => {
  const { series, addValue } = createSeriesMap(labels);
  records.forEach((record) => {
    const date = readDate(record.date);
    const totals = isRecord(record.totals) ? record.totals : undefined;
    addValue(date, 'cached_text_input_tokens', 'Cached input', toNumber(totals?.cached_text_input_tokens));
    addValue(
      date,
      'uncached_text_input_tokens',
      'Uncached input',
      toNumber(totals?.uncached_text_input_tokens)
    );
    addValue(date, 'text_output_tokens', 'Output', toNumber(totals?.text_output_tokens));
  });
  return finalizeSeries(series);
};

const readCount = (record: Record<string, unknown>, keys: string[]): number => {
  for (const key of keys) {
    const value = toNumber(record[key]);
    if (value !== 0) return value;
  }
  return 0;
};

const readFirstString = (record: Record<string, unknown>, keys: string[]): string => {
  for (const key of keys) {
    const value = toStringValue(record[key]);
    if (value) return value;
  }
  return '';
};

const normalizeNamedUsageSeries = (
  records: Array<CodexAnalyticsDailySkillUsageMetric | CodexAnalyticsDailyPluginUsageMetric>,
  labels: string[],
  arrayKeys: string[],
  keyFields: string[],
  labelFields: string[],
  countFields: string[]
): CodexAnalyticsSeriesDataset[] => {
  const { series, addValue } = createSeriesMap(labels);

  records.forEach((record) => {
    const date = readDate(record.date);
    for (const arrayKey of arrayKeys) {
      const rawItems = isRecord(record) ? record[arrayKey] : undefined;
      if (!Array.isArray(rawItems)) continue;

      rawItems.forEach((rawItem) => {
        if (!isRecord(rawItem)) return;
        const key = readFirstString(rawItem, keyFields);
        const label = readFirstString(rawItem, labelFields) || key;
        const count = readCount(rawItem, countFields);
        addValue(date, key, label, count, {
          description: key && key !== label ? key : undefined,
          rawName: key,
        });
      });
    }
  });

  return finalizeSeries(series, 10);
};

const normalizeWorkspaceTotals = (
  records: CodexAnalyticsDailyWorkspaceUsageCount[]
): CodexAnalyticsMetricTotals => {
  const totals = emptyTotals();
  records.forEach((record) => {
    if (isRecord(record.totals)) {
      addTotals(totals, record.totals);
    }
  });
  if (!totals.textTotalTokens) {
    totals.textTotalTokens =
      totals.uncachedTextInputTokens + totals.cachedTextInputTokens + totals.textOutputTokens;
  }
  return totals;
};

const buildViewModel = (
  params: Pick<CodexAnalyticsFetchParams, 'startDate' | 'endDate'>,
  skillResponse: CodexAnalyticsSkillUsageResponse,
  pluginResponse: CodexAnalyticsPluginUsageResponse,
  workspaceResponse: CodexAnalyticsWorkspaceUsageCountsResponse,
  tokenResponse: CodexAnalyticsTokenUsageBreakdownResponse
): CodexAnalyticsViewModel => {
  const skillRecords = Array.isArray(skillResponse.data) ? skillResponse.data : [];
  const pluginRecords = Array.isArray(pluginResponse.data) ? pluginResponse.data : [];
  const workspaceRecords = Array.isArray(workspaceResponse.data) ? workspaceResponse.data : [];
  const tokenRecords = Array.isArray(tokenResponse.data) ? tokenResponse.data : [];
  const labels = collectLabels(
    buildDateLabels(params.startDate, params.endDate),
    skillRecords,
    pluginRecords,
    workspaceRecords,
    tokenRecords
  );

  const surfacePercentSeries = normalizeSurfacePercentSeries(tokenRecords, labels);
  const clientCreditSeries = normalizeClientMetricSeries(workspaceRecords, labels, 'credits');
  const clientTokenSeries = normalizeClientMetricSeries(
    workspaceRecords,
    labels,
    'text_total_tokens'
  );
  const clientTurnSeries = normalizeClientMetricSeries(workspaceRecords, labels, 'turns');
  const clientThreadSeries = normalizeClientMetricSeries(workspaceRecords, labels, 'threads');
  const modelPercentSeries = normalizeModelPercentSeries(tokenRecords, labels);
  const modelActualCreditSeries = normalizeModelMetricSeries(workspaceRecords, labels, 'credits');
  const modelTurnSeries = normalizeModelMetricSeries(workspaceRecords, labels, 'turns');
  const modelThreadSeries = normalizeModelMetricSeries(workspaceRecords, labels, 'threads');
  const tokenBreakdownSeries = normalizeTokenBreakdownSeries(workspaceRecords, labels);

  return {
    startDate: params.startDate,
    endDate: params.endDate,
    labels,
    totals: normalizeWorkspaceTotals(workspaceRecords),
    surfacePercentSeries,
    clientCreditSeries,
    clientTokenSeries,
    clientTurnSeries,
    clientThreadSeries,
    modelPercentSeries,
    modelActualCreditSeries,
    modelTurnSeries,
    modelThreadSeries,
    tokenBreakdownSeries,
    clientSeries: clientCreditSeries,
    surfaceSeries: surfacePercentSeries,
    modelCreditSeries: modelPercentSeries,
    skillInvocationSeries: normalizeNamedUsageSeries(
      skillRecords,
      labels,
      ['skill_usage_overviews'],
      ['skill_name', 'name', 'skill_id'],
      ['display_name', 'skill_name', 'name', 'skill_id'],
      ['invocation_counts', 'invocation_count', 'calls', 'count']
    ),
    pluginInvocationSeries: normalizeNamedUsageSeries(
      pluginRecords,
      labels,
      ['plugin_usage_overviews', 'plugin_usage_overview', 'plugins'],
      ['plugin_name', 'name', 'plugin_id', 'id'],
      ['display_name', 'plugin_name', 'name', 'plugin_id', 'id'],
      ['invocation_counts', 'invocation_count', 'calls', 'count']
    ),
  };
};

export const fetchCodexAnalytics = async ({
  authIndex,
  accountId,
  startDate,
  endDate,
}: CodexAnalyticsFetchParams): Promise<CodexAnalyticsViewModel> => {
  const analyticsParams = {
    start_date: startDate,
    end_date: endDate,
    group_by: 'day',
    workspace_user: true,
  };

  const [skillResponse, pluginResponse, workspaceResponse, tokenResponse] = await Promise.all([
    requestJson<CodexAnalyticsSkillUsageResponse>(
      authIndex,
      buildUrl(DAILY_SKILL_USAGE_URL, { ...analyticsParams, top_skill_limit: 10 }),
      accountId
    ),
    requestJson<CodexAnalyticsPluginUsageResponse>(
      authIndex,
      buildUrl(DAILY_PLUGIN_USAGE_URL, { ...analyticsParams, top_plugin_limit: 10 }),
      accountId
    ),
    requestJson<CodexAnalyticsWorkspaceUsageCountsResponse>(
      authIndex,
      buildUrl(DAILY_WORKSPACE_USAGE_URL, analyticsParams),
      accountId
    ),
    requestJson<CodexAnalyticsTokenUsageBreakdownResponse>(
      authIndex,
      buildUrl(DAILY_TOKEN_BREAKDOWN_URL, {
        start_date: startDate,
        end_date: endDate,
        group_by: 'day',
      }),
      accountId
    ),
  ]);

  return buildViewModel(
    { startDate, endDate },
    skillResponse,
    pluginResponse,
    workspaceResponse,
    tokenResponse
  );
};
