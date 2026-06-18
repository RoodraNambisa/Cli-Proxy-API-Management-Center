import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select } from '@/components/ui/Select';
import { authFilesApi } from '@/services/api/authFiles';
import { useUsageStatsStore, type UsageDetailsPage } from '@/stores';
import type {
  GeminiKeyConfig,
  ProviderKeyConfig,
  OpenAIProviderConfig,
  UsageRangeQuery,
} from '@/types';
import type { AuthFileItem } from '@/types/authFile';
import type { CredentialInfo } from '@/types/sourceInfo';
import { buildSourceInfoMap, resolveSourceDisplay } from '@/utils/sourceResolver';
import { parseTimestampMs } from '@/utils/timestamp';
import {
  extractLatencyMs,
  extractTotalTokens,
  formatDurationMs,
  LATENCY_SOURCE_FIELD,
  normalizeAuthIndex,
  type UsageDetail,
} from '@/utils/usage';
import { downloadBlob } from '@/utils/download';
import styles from '@/pages/UsagePage.module.scss';

const ALL_FILTER = '__all__';
const FAILED_FILTER = 'failed';
const SUCCESS_FILTER = 'success';
const DETAILS_LIMIT = 200;
const MAX_RENDERED_EVENTS = 500;
const EMPTY_DETAILS: UsageDetail[] = [];

type DetailFilters = {
  model: string;
  source: string;
  authIndex: string;
  result: string;
};

type RequestEventRow = {
  id: string;
  timestamp: string;
  timestampMs: number;
  timestampLabel: string;
  model: string;
  sourceKey: string;
  sourceRaw: string;
  source: string;
  sourceType: string;
  authIndex: string;
  failed: boolean;
  latencyMs: number | null;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
  totalTokens: number;
};

export interface RequestEventsDetailsCardProps {
  loading: boolean;
  geminiKeys: GeminiKeyConfig[];
  claudeConfigs: ProviderKeyConfig[];
  codexConfigs: ProviderKeyConfig[];
  vertexConfigs: ProviderKeyConfig[];
  openaiProviders: OpenAIProviderConfig[];
  range: UsageRangeQuery;
}

const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return parsed;
};

const encodeCsv = (value: string | number): string => {
  const text = String(value ?? '');
  const trimmedLeft = text.replace(/^\s+/, '');
  const safeText = trimmedLeft && /^[=+\-@]/.test(trimmedLeft) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
};

const buildDetailsQuery = (filters: DetailFilters, range: UsageRangeQuery) => ({
  ...range,
  ...(filters.model !== ALL_FILTER ? { model: filters.model } : {}),
  ...(filters.source !== ALL_FILTER ? { source: filters.source } : {}),
  ...(filters.authIndex !== ALL_FILTER ? { auth_index: filters.authIndex } : {}),
  ...(filters.result !== ALL_FILTER ? { failed: filters.result === FAILED_FILTER } : {}),
  limit: DETAILS_LIMIT,
  sort_by: 'created_at',
  sort_order: 'desc',
});

export function RequestEventsDetailsCard({
  loading,
  geminiKeys,
  claudeConfigs,
  codexConfigs,
  vertexConfigs,
  openaiProviders,
  range,
}: RequestEventsDetailsCardProps) {
  const { t, i18n } = useTranslation();
  const loadUsageDetails = useUsageStatsStore((state) => state.loadUsageDetails);
  const detailsLoading = useUsageStatsStore((state) => state.detailsLoading);
  const detailsError = useUsageStatsStore((state) => state.detailsError);
  const latencyHint = t('usage_stats.latency_unit_hint', {
    field: LATENCY_SOURCE_FIELD,
    unit: t('usage_stats.duration_unit_ms'),
  });

  const [detailsOpened, setDetailsOpened] = useState(false);
  const [detailsPage, setDetailsPage] = useState<UsageDetailsPage | null>(null);
  const [modelFilter, setModelFilter] = useState(ALL_FILTER);
  const [sourceFilter, setSourceFilter] = useState(ALL_FILTER);
  const [authIndexFilter, setAuthIndexFilter] = useState(ALL_FILTER);
  const [resultFilter, setResultFilter] = useState(ALL_FILTER);
  const [authFileMap, setAuthFileMap] = useState<Map<string, CredentialInfo>>(new Map());

  useEffect(() => {
    let cancelled = false;
    authFilesApi
      .list()
      .then((res) => {
        if (cancelled) return;
        const files = Array.isArray(res) ? res : (res as { files?: AuthFileItem[] })?.files;
        if (!Array.isArray(files)) return;
        const map = new Map<string, CredentialInfo>();
        files.forEach((file) => {
          const key = normalizeAuthIndex(file['auth_index'] ?? file.authIndex);
          if (!key) return;
          map.set(key, {
            name: file.name || key,
            type: (file.type || file.provider || '').toString(),
          });
        });
        setAuthFileMap(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const sourceInfoMap = useMemo(
    () =>
      buildSourceInfoMap({
        geminiApiKeys: geminiKeys,
        claudeApiKeys: claudeConfigs,
        codexApiKeys: codexConfigs,
        vertexApiKeys: vertexConfigs,
        openaiCompatibility: openaiProviders,
      }),
    [claudeConfigs, codexConfigs, geminiKeys, openaiProviders, vertexConfigs]
  );

  const details = detailsPage?.details ?? EMPTY_DETAILS;

  const rows = useMemo<RequestEventRow[]>(() => {
    const baseRows = details.map((detail: UsageDetail, index) => {
      const timestamp = detail.timestamp;
      const timestampMs =
        typeof detail.__timestampMs === 'number' && detail.__timestampMs > 0
          ? detail.__timestampMs
          : parseTimestampMs(timestamp);
      const date = Number.isNaN(timestampMs) ? null : new Date(timestampMs);
      const sourceRaw = String(detail.source ?? '').trim();
      const authIndexRaw = detail.auth_index as unknown;
      const authIndex =
        authIndexRaw === null || authIndexRaw === undefined || authIndexRaw === ''
          ? '-'
          : String(authIndexRaw);
      const sourceInfo = resolveSourceDisplay(sourceRaw, authIndexRaw, sourceInfoMap, authFileMap);
      const source = sourceInfo.displayName;
      const sourceKey = sourceInfo.identityKey ?? `source:${sourceRaw || source}`;
      const sourceType = sourceInfo.type;
      const model = String(detail.__modelName ?? '').trim() || '-';
      const inputTokens = Math.max(toNumber(detail.tokens?.input_tokens), 0);
      const outputTokens = Math.max(toNumber(detail.tokens?.output_tokens), 0);
      const reasoningTokens = Math.max(toNumber(detail.tokens?.reasoning_tokens), 0);
      const cachedTokens = Math.max(
        Math.max(toNumber(detail.tokens?.cached_tokens), 0),
        Math.max(toNumber(detail.tokens?.cache_tokens), 0)
      );
      const totalTokens = Math.max(
        toNumber(detail.tokens?.total_tokens),
        extractTotalTokens(detail)
      );
      const latencyMs = extractLatencyMs(detail);

      return {
        id: `${timestamp}-${model}-${sourceKey}-${authIndex}-${index}`,
        timestamp,
        timestampMs: Number.isNaN(timestampMs) ? 0 : timestampMs,
        timestampLabel: date ? date.toLocaleString(i18n.language) : timestamp || '-',
        model,
        sourceKey,
        sourceRaw: sourceRaw || '-',
        source,
        sourceType,
        authIndex,
        failed: detail.failed === true,
        latencyMs,
        inputTokens,
        outputTokens,
        reasoningTokens,
        cachedTokens,
        totalTokens,
      };
    });

    const sourceLabelKeyMap = new Map<string, Set<string>>();
    baseRows.forEach((row) => {
      const keys = sourceLabelKeyMap.get(row.source) ?? new Set<string>();
      keys.add(row.sourceKey);
      sourceLabelKeyMap.set(row.source, keys);
    });

    return baseRows.map((row) => {
      const labelKeyCount = sourceLabelKeyMap.get(row.source)?.size ?? 0;
      if (labelKeyCount <= 1) return row;
      if (row.authIndex !== '-') return { ...row, source: `${row.source} · ${row.authIndex}` };
      if (row.sourceRaw !== '-' && row.sourceRaw !== row.source) {
        return { ...row, source: `${row.source} · ${row.sourceRaw}` };
      }
      if (row.sourceType) return { ...row, source: `${row.source} · ${row.sourceType}` };
      return { ...row, source: `${row.source} · ${row.sourceKey}` };
    });
  }, [authFileMap, details, i18n.language, sourceInfoMap]);

  const hasLatencyData = useMemo(() => rows.some((row) => row.latencyMs !== null), [rows]);

  const modelOptions = useMemo(
    () => [
      { value: ALL_FILTER, label: t('usage_stats.filter_all') },
      ...Array.from(new Set(rows.map((row) => row.model))).map((model) => ({
        value: model,
        label: model,
      })),
    ],
    [rows, t]
  );

  const sourceOptions = useMemo(() => {
    const optionMap = new Map<string, string>();
    rows.forEach((row) => {
      if (!optionMap.has(row.sourceKey)) {
        optionMap.set(row.sourceKey, row.source);
      }
    });

    return [
      { value: ALL_FILTER, label: t('usage_stats.filter_all') },
      ...Array.from(optionMap.entries()).map(([value, label]) => ({
        value,
        label,
      })),
    ];
  }, [rows, t]);

  const authIndexOptions = useMemo(
    () => [
      { value: ALL_FILTER, label: t('usage_stats.filter_all') },
      ...Array.from(new Set(rows.map((row) => row.authIndex))).map((authIndex) => ({
        value: authIndex,
        label: authIndex,
      })),
    ],
    [rows, t]
  );

  const resultOptions = useMemo(
    () => [
      { value: ALL_FILTER, label: t('usage_stats.filter_all') },
      { value: SUCCESS_FILTER, label: t('stats.success') },
      { value: FAILED_FILTER, label: t('stats.failure') },
    ],
    [t]
  );

  const currentFilters = useMemo(
    () => ({
      model: modelFilter,
      source: sourceFilter,
      authIndex: authIndexFilter,
      result: resultFilter,
    }),
    [authIndexFilter, modelFilter, resultFilter, sourceFilter]
  );

  const loadDetailsPage = useCallback(
    async (filters: DetailFilters, offset = 0, append = false) => {
      const page = await loadUsageDetails({
        query: { ...buildDetailsQuery(filters, range), offset },
        append,
      });
      setDetailsPage(page);
    },
    [loadUsageDetails, range]
  );

  useEffect(() => {
    if (!detailsOpened) return;
    void Promise.resolve()
      .then(() => loadDetailsPage(currentFilters, 0, false))
      .catch(() => {});
  }, [currentFilters, detailsOpened, loadDetailsPage]);

  const handleOpenDetails = () => {
    setDetailsOpened(true);
  };

  const handleModelFilterChange = (value: string) => {
    setModelFilter(value);
  };

  const handleSourceFilterChange = (value: string) => {
    setSourceFilter(value);
  };

  const handleAuthIndexFilterChange = (value: string) => {
    setAuthIndexFilter(value);
  };

  const handleResultFilterChange = (value: string) => {
    setResultFilter(value);
  };

  const renderedRows = useMemo(() => rows.slice(0, MAX_RENDERED_EVENTS), [rows]);

  const hasActiveFilters =
    modelFilter !== ALL_FILTER ||
    sourceFilter !== ALL_FILTER ||
    authIndexFilter !== ALL_FILTER ||
    resultFilter !== ALL_FILTER;

  const handleClearFilters = () => {
    setModelFilter(ALL_FILTER);
    setSourceFilter(ALL_FILTER);
    setAuthIndexFilter(ALL_FILTER);
    setResultFilter(ALL_FILTER);
  };

  const handleExportCsv = () => {
    if (!rows.length) return;

    const csvHeader = [
      'timestamp',
      'model',
      'source',
      'source_raw',
      'auth_index',
      'result',
      ...(hasLatencyData ? ['latency_ms'] : []),
      'input_tokens',
      'output_tokens',
      'reasoning_tokens',
      'cached_tokens',
      'total_tokens',
    ];

    const csvRows = rows.map((row) =>
      [
        row.timestamp,
        row.model,
        row.source,
        row.sourceRaw,
        row.authIndex,
        row.failed ? 'failed' : 'success',
        ...(hasLatencyData ? [row.latencyMs ?? ''] : []),
        row.inputTokens,
        row.outputTokens,
        row.reasoningTokens,
        row.cachedTokens,
        row.totalTokens,
      ]
        .map((value) => encodeCsv(value))
        .join(',')
    );

    const content = [csvHeader.join(','), ...csvRows].join('\n');
    const fileTime = new Date().toISOString().replace(/[:.]/g, '-');
    downloadBlob({
      filename: `usage-events-${fileTime}.csv`,
      blob: new Blob([content], { type: 'text/csv;charset=utf-8' }),
    });
  };

  const handleExportJson = () => {
    if (!rows.length) return;

    const payload = rows.map((row) => ({
      timestamp: row.timestamp,
      model: row.model,
      source: row.source,
      source_raw: row.sourceRaw,
      auth_index: row.authIndex,
      failed: row.failed,
      ...(hasLatencyData && row.latencyMs !== null ? { latency_ms: row.latencyMs } : {}),
      tokens: {
        input_tokens: row.inputTokens,
        output_tokens: row.outputTokens,
        reasoning_tokens: row.reasoningTokens,
        cached_tokens: row.cachedTokens,
        total_tokens: row.totalTokens,
      },
    }));

    const content = JSON.stringify(payload, null, 2);
    const fileTime = new Date().toISOString().replace(/[:.]/g, '-');
    downloadBlob({
      filename: `usage-events-${fileTime}.json`,
      blob: new Blob([content], { type: 'application/json;charset=utf-8' }),
    });
  };

  const totalMatched = detailsPage?.totalMatched;
  const loadedCount = rows.length;

  return (
    <Card
      title={t('usage_stats.request_events_title')}
      extra={
        <div className={styles.requestEventsActions}>
          {!detailsOpened ? (
            <Button variant="secondary" size="sm" onClick={handleOpenDetails} disabled={loading}>
              {t('usage_stats.request_events_load')}
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearFilters}
                disabled={!hasActiveFilters || detailsLoading}
              >
                {t('usage_stats.clear_filters')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void loadDetailsPage(currentFilters, 0, false).catch(() => {})}
                disabled={detailsLoading}
              >
                {detailsLoading ? t('common.loading') : t('usage_stats.refresh')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleExportCsv}
                disabled={rows.length === 0 || detailsLoading}
              >
                {t('usage_stats.export_csv')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleExportJson}
                disabled={rows.length === 0 || detailsLoading}
              >
                {t('usage_stats.export_json')}
              </Button>
            </>
          )}
        </div>
      }
    >
      {!detailsOpened ? (
        <EmptyState
          title={t('usage_stats.request_events_lazy_title')}
          description={t('usage_stats.request_events_lazy_desc')}
        />
      ) : (
        <>
          <div className={styles.requestEventsToolbar}>
            <div className={styles.requestEventsFilterItem}>
              <span className={styles.requestEventsFilterLabel}>
                {t('usage_stats.request_events_filter_model')}
              </span>
              <Select
                value={modelFilter}
                options={modelOptions}
                onChange={handleModelFilterChange}
                className={styles.requestEventsSelect}
                ariaLabel={t('usage_stats.request_events_filter_model')}
                fullWidth={false}
              />
            </div>
            <div className={styles.requestEventsFilterItem}>
              <span className={styles.requestEventsFilterLabel}>
                {t('usage_stats.request_events_filter_source')}
              </span>
              <Select
                value={sourceFilter}
                options={sourceOptions}
                onChange={handleSourceFilterChange}
                className={styles.requestEventsSelect}
                ariaLabel={t('usage_stats.request_events_filter_source')}
                fullWidth={false}
              />
            </div>
            <div className={styles.requestEventsFilterItem}>
              <span className={styles.requestEventsFilterLabel}>
                {t('usage_stats.request_events_filter_auth_index')}
              </span>
              <Select
                value={authIndexFilter}
                options={authIndexOptions}
                onChange={handleAuthIndexFilterChange}
                className={styles.requestEventsSelect}
                ariaLabel={t('usage_stats.request_events_filter_auth_index')}
                fullWidth={false}
              />
            </div>
            <div className={styles.requestEventsFilterItem}>
              <span className={styles.requestEventsFilterLabel}>
                {t('usage_stats.request_events_filter_result')}
              </span>
              <Select
                value={resultFilter}
                options={resultOptions}
                onChange={handleResultFilterChange}
                className={styles.requestEventsSelect}
                ariaLabel={t('usage_stats.request_events_filter_result')}
                fullWidth={false}
              />
            </div>
          </div>

          {detailsError && <div className={styles.errorBox}>{detailsError}</div>}

          {detailsLoading && rows.length === 0 ? (
            <div className={styles.hint}>{t('common.loading')}</div>
          ) : rows.length === 0 ? (
            <EmptyState
              title={t('usage_stats.request_events_empty_title')}
              description={t('usage_stats.request_events_empty_desc')}
            />
          ) : (
            <>
              <div className={styles.requestEventsMeta}>
                <span>
                  {t('usage_stats.request_events_loaded_count', {
                    count: loadedCount,
                    total: totalMatched ?? loadedCount,
                  })}
                </span>
                {hasLatencyData && (
                  <span className={styles.requestEventsLimitHint}>{latencyHint}</span>
                )}
                {rows.length > MAX_RENDERED_EVENTS && (
                  <span className={styles.requestEventsLimitHint}>
                    {t('usage_stats.request_events_limit_hint', {
                      shown: MAX_RENDERED_EVENTS,
                      total: rows.length,
                    })}
                  </span>
                )}
              </div>

              <div className={styles.requestEventsTableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>{t('usage_stats.request_events_timestamp')}</th>
                      <th>{t('usage_stats.model_name')}</th>
                      <th>{t('usage_stats.request_events_source')}</th>
                      <th>{t('usage_stats.request_events_auth_index')}</th>
                      <th>{t('usage_stats.request_events_result')}</th>
                      {hasLatencyData && <th title={latencyHint}>{t('usage_stats.time')}</th>}
                      <th>{t('usage_stats.input_tokens')}</th>
                      <th>{t('usage_stats.output_tokens')}</th>
                      <th>{t('usage_stats.reasoning_tokens')}</th>
                      <th>{t('usage_stats.cached_tokens')}</th>
                      <th>{t('usage_stats.total_tokens')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {renderedRows.map((row) => (
                      <tr key={row.id}>
                        <td title={row.timestamp} className={styles.requestEventsTimestamp}>
                          {row.timestampLabel}
                        </td>
                        <td className={styles.modelCell}>{row.model}</td>
                        <td className={styles.requestEventsSourceCell} title={row.source}>
                          <span>{row.source}</span>
                          {row.sourceType && (
                            <span className={styles.credentialType}>{row.sourceType}</span>
                          )}
                        </td>
                        <td className={styles.requestEventsAuthIndex} title={row.authIndex}>
                          {row.authIndex}
                        </td>
                        <td>
                          <span
                            className={
                              row.failed
                                ? styles.requestEventsResultFailed
                                : styles.requestEventsResultSuccess
                            }
                          >
                            {row.failed ? t('stats.failure') : t('stats.success')}
                          </span>
                        </td>
                        {hasLatencyData && (
                          <td className={styles.durationCell}>{formatDurationMs(row.latencyMs)}</td>
                        )}
                        <td>{row.inputTokens.toLocaleString()}</td>
                        <td>{row.outputTokens.toLocaleString()}</td>
                        <td>{row.reasoningTokens.toLocaleString()}</td>
                        <td>{row.cachedTokens.toLocaleString()}</td>
                        <td>{row.totalTokens.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {detailsPage?.hasMore && (
                <div className={styles.requestEventsLoadMore}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      void loadDetailsPage(
                        currentFilters,
                        detailsPage?.nextOffset ?? 0,
                        true
                      ).catch(() => {})
                    }
                    disabled={detailsLoading}
                  >
                    {detailsLoading
                      ? t('common.loading')
                      : t('usage_stats.request_events_load_more')}
                  </Button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </Card>
  );
}
