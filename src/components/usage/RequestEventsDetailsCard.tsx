import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { usageApi } from '@/services/api/usage';
import { useUsageStatsStore, type UsageDetailsPage } from '@/stores';
import type {
  GeminiKeyConfig,
  ProviderKeyConfig,
  OpenAIProviderConfig,
  UsageAuthSummary,
  UsageRangeQuery,
} from '@/types';
import type { CredentialInfo } from '@/types/sourceInfo';
import { buildSourceInfoMap, resolveSourceDisplay } from '@/utils/sourceResolver';
import { parseTimestampMs } from '@/utils/timestamp';
import {
  extractLatencyMs,
  extractTotalTokens,
  formatDurationMs,
  LATENCY_SOURCE_FIELD,
  normalizeAuthIndex,
  normalizeUsageSourceId,
  type UsageDetail,
} from '@/utils/usage';
import { downloadBlob } from '@/utils/download';
import { buildUsageDetailsQuery, type UsageDetailFilters } from './requestDetailsQuery';
import type { UsageResourceStatus } from './hooks/useUsageData';
import styles from '@/pages/UsagePage.module.scss';

const ALL_FILTER = '__all__';
const FAILED_FILTER = 'failed';
const SUCCESS_FILTER = 'success';
const MAX_RENDERED_EVENTS = 500;
const EMPTY_DETAILS: UsageDetail[] = [];

type RequestEventRow = {
  id: string;
  timestamp: string;
  timestampMs: number;
  timestampLabel: string;
  model: string;
  sourceKey: string;
  sourceRaw: string;
  sourceFilterKey: string;
  sourceFilterValue: string;
  source: string;
  sourceType: string;
  authIndex: string;
  failed: boolean;
  latencyMs: number | null;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
  cacheCreationTokens: number;
  totalTokens: number;
  requestServiceTier: string;
  responseServiceTier: string;
};

export interface RequestEventsDetailsCardProps {
  loading: boolean;
  geminiKeys: GeminiKeyConfig[];
  interactionsKeys: GeminiKeyConfig[];
  claudeConfigs: ProviderKeyConfig[];
  codexConfigs: ProviderKeyConfig[];
  vertexConfigs: ProviderKeyConfig[];
  openaiProviders: OpenAIProviderConfig[];
  range: UsageRangeQuery;
  availableModels: string[];
  availableSources: string[];
  authSummaries: UsageAuthSummary[];
  availabilityStatus: UsageResourceStatus;
  availabilityError?: string;
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

export function RequestEventsDetailsCard({
  loading,
  geminiKeys,
  interactionsKeys,
  claudeConfigs,
  codexConfigs,
  vertexConfigs,
  openaiProviders,
  range,
  availableModels,
  availableSources,
  authSummaries,
  availabilityStatus,
  availabilityError = '',
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
  const [detailsUnsupported, setDetailsUnsupported] = useState(false);
  const [detailsPage, setDetailsPage] = useState<UsageDetailsPage | null>(null);
  const [modelFilter, setModelFilter] = useState(ALL_FILTER);
  const [sourceFilter, setSourceFilter] = useState(ALL_FILTER);
  const [sourceSearch, setSourceSearch] = useState('');
  const [remoteSources, setRemoteSources] = useState<string[]>([]);
  const [sourceFacetsLoading, setSourceFacetsLoading] = useState(false);
  const [sourceFacetsUnsupported, setSourceFacetsUnsupported] = useState(false);
  const [authIndexFilter, setAuthIndexFilter] = useState(ALL_FILTER);
  const [resultFilter, setResultFilter] = useState(ALL_FILTER);
  const sourceFilterValuesRef = useRef(new Map<string, string>());
  const detailsControllerRef = useRef<AbortController | null>(null);
  const sourceFacetsControllerRef = useRef<AbortController | null>(null);

  const authFileMap = useMemo(() => {
    const map = new Map<string, CredentialInfo>();
    authSummaries.forEach((auth) => {
      const key = normalizeAuthIndex(auth.auth_index ?? auth.authIndex);
      if (!key) return;
      map.set(key, {
        name: auth.name || auth.label || auth.email || auth.account || key,
        type: String(auth.type || auth.provider || ''),
      });
    });
    return map;
  }, [authSummaries]);

  const sourceInfoMap = useMemo(
    () =>
      buildSourceInfoMap({
        geminiApiKeys: geminiKeys,
        interactionsApiKeys: interactionsKeys,
        claudeApiKeys: claudeConfigs,
        codexApiKeys: codexConfigs,
        vertexApiKeys: vertexConfigs,
        openaiCompatibility: openaiProviders,
      }),
    [claudeConfigs, codexConfigs, geminiKeys, interactionsKeys, openaiProviders, vertexConfigs]
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
      const sourceFilterValue = String(detail.__sourceFilterValue ?? '').trim();
      const sourceFilterKey = sourceRaw || `source-${index}`;
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
      const cacheCreationTokens = Math.max(toNumber(detail.tokens?.cache_creation_tokens), 0);
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
        sourceFilterKey,
        sourceFilterValue,
        source,
        sourceType,
        authIndex,
        failed: detail.failed === true,
        latencyMs,
        inputTokens,
        outputTokens,
        reasoningTokens,
        cachedTokens,
        cacheCreationTokens,
        totalTokens,
        requestServiceTier: String(detail.request_service_tier ?? '').trim(),
        responseServiceTier: String(detail.response_service_tier ?? '').trim(),
      };
    });

    const sourceLabelKeyMap = new Map<string, Set<string>>();
    baseRows.forEach((row) => {
      const keys = sourceLabelKeyMap.get(row.source) ?? new Set<string>();
      keys.add(row.sourceFilterKey);
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
  const hasServiceTierData = useMemo(
    () => rows.some((row) => row.requestServiceTier || row.responseServiceTier),
    [rows]
  );

  const modelOptions = useMemo(() => {
    const values = new Set(
      [...availableModels, ...rows.map((row) => row.model)]
        .map((model) => model.trim())
        .filter((model) => model && model !== '-')
    );
    if (modelFilter !== ALL_FILTER) values.add(modelFilter);
    return [
      { value: ALL_FILTER, label: t('usage_stats.filter_all') },
      ...Array.from(values).map((model) => ({ value: model, label: model })),
    ];
  }, [availableModels, modelFilter, rows, t]);

  const sourceOptions = useMemo(() => {
    const optionMap = new Map<string, string>();
    [...availableSources, ...remoteSources].forEach((source) => {
      const sourceFilterValue = source.trim();
      const sourceFilterKey = normalizeUsageSourceId(sourceFilterValue);
      if (!sourceFilterValue || !sourceFilterKey) return;
      sourceFilterValuesRef.current.set(sourceFilterKey, sourceFilterValue);
      const sourceInfo = resolveSourceDisplay(sourceFilterKey, null, sourceInfoMap, authFileMap);
      optionMap.set(sourceFilterKey, sourceInfo.displayName);
    });
    rows.forEach((row) => {
      if (row.sourceFilterValue) {
        sourceFilterValuesRef.current.set(row.sourceFilterKey, row.sourceFilterValue);
      }
      if (row.sourceFilterValue && row.sourceFilterKey && !optionMap.has(row.sourceFilterKey)) {
        optionMap.set(row.sourceFilterKey, row.source);
      }
    });
    if (sourceFilter !== ALL_FILTER && !optionMap.has(sourceFilter)) {
      optionMap.set(sourceFilter, sourceFilter);
    }

    const labelCounts = new Map<string, number>();
    optionMap.forEach((label) => labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1));

    return [
      { value: ALL_FILTER, label: t('usage_stats.filter_all') },
      ...Array.from(optionMap.entries()).map(([value, label]) => ({
        value,
        label: (labelCounts.get(label) ?? 0) > 1 ? `${label} · ${value}` : label,
      })),
    ];
  }, [authFileMap, availableSources, remoteSources, rows, sourceFilter, sourceInfoMap, t]);

  const authIndexOptions = useMemo(() => {
    const values = new Set(
      [
        ...authSummaries.map((auth) => auth.auth_index ?? auth.authIndex ?? ''),
        ...rows.map((row) => row.authIndex),
      ]
        .map((authIndex) => normalizeAuthIndex(authIndex))
        .filter((authIndex): authIndex is string => Boolean(authIndex) && authIndex !== '-')
    );
    if (authIndexFilter !== ALL_FILTER) values.add(authIndexFilter);
    return [
      { value: ALL_FILTER, label: t('usage_stats.filter_all') },
      ...Array.from(values).map((authIndex) => ({
        value: authIndex,
        label: authIndex,
      })),
    ];
  }, [authIndexFilter, authSummaries, rows, t]);

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
    async (filters: UsageDetailFilters, offset = 0, append = false) => {
      detailsControllerRef.current?.abort();
      const controller = new AbortController();
      detailsControllerRef.current = controller;
      const sourceFilterValue =
        filters.source === ALL_FILTER
          ? undefined
          : sourceFilterValuesRef.current.get(filters.source);
      try {
        const page = await loadUsageDetails({
          query: { ...buildUsageDetailsQuery(filters, range, sourceFilterValue), offset },
          append,
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setDetailsUnsupported(false);
          setDetailsPage(page);
        }
      } catch (error: unknown) {
        const status =
          error && typeof error === 'object' && 'status' in error
            ? Number((error as { status?: unknown }).status)
            : undefined;
        if (status === 404) {
          setDetailsUnsupported(true);
          return;
        }
        throw error;
      } finally {
        if (detailsControllerRef.current === controller) {
          detailsControllerRef.current = null;
        }
      }
    },
    [loadUsageDetails, range]
  );

  useEffect(
    () => () => {
      detailsControllerRef.current?.abort();
      sourceFacetsControllerRef.current?.abort();
    },
    []
  );

  useEffect(() => {
    if (!detailsOpened || sourceFacetsUnsupported) return;
    const timer = window.setTimeout(() => {
      sourceFacetsControllerRef.current?.abort();
      const controller = new AbortController();
      sourceFacetsControllerRef.current = controller;
      setSourceFacetsLoading(true);
      void usageApi
        .getUsageFacets(
          { ...range, kind: 'source', q: sourceSearch.trim(), limit: 100 },
          { signal: controller.signal }
        )
        .then((response) => {
          if (controller.signal.aborted) return;
          setRemoteSources(
            (response.items ?? []).map((item) => String(item.value ?? '').trim()).filter(Boolean)
          );
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          const status =
            error && typeof error === 'object' && 'status' in error
              ? Number((error as { status?: unknown }).status)
              : undefined;
          if (status === 404) setSourceFacetsUnsupported(true);
        })
        .finally(() => {
          if (sourceFacetsControllerRef.current === controller) {
            sourceFacetsControllerRef.current = null;
            setSourceFacetsLoading(false);
          }
        });
    }, 300);
    return () => {
      window.clearTimeout(timer);
      sourceFacetsControllerRef.current?.abort();
    };
  }, [detailsOpened, range, sourceFacetsUnsupported, sourceSearch]);

  useEffect(() => {
    const canLoad = availabilityStatus === 'ready' || availabilityStatus === 'empty';
    if (!detailsOpened || !canLoad || detailsUnsupported) return;
    void Promise.resolve()
      .then(() => loadDetailsPage(currentFilters, 0, false))
      .catch(() => {});
  }, [availabilityStatus, currentFilters, detailsOpened, detailsUnsupported, loadDetailsPage]);

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
    setSourceSearch('');
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
      ...(hasServiceTierData ? ['request_service_tier', 'response_service_tier'] : []),
      'input_tokens',
      'output_tokens',
      'reasoning_tokens',
      'cached_tokens',
      'cache_creation_tokens',
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
        ...(hasServiceTierData ? [row.requestServiceTier, row.responseServiceTier] : []),
        row.inputTokens,
        row.outputTokens,
        row.reasoningTokens,
        row.cachedTokens,
        row.cacheCreationTokens,
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
      ...(row.requestServiceTier ? { request_service_tier: row.requestServiceTier } : {}),
      ...(row.responseServiceTier ? { response_service_tier: row.responseServiceTier } : {}),
      tokens: {
        input_tokens: row.inputTokens,
        output_tokens: row.outputTokens,
        reasoning_tokens: row.reasoningTokens,
        cached_tokens: row.cachedTokens,
        cache_creation_tokens: row.cacheCreationTokens,
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
  const canLoadDetails = availabilityStatus === 'ready' || availabilityStatus === 'empty';
  const availabilityText =
    availabilityStatus === 'disabled'
      ? t('usage_stats.state_disabled')
      : availabilityStatus === 'unsupported'
        ? t('usage_stats.state_unsupported')
        : availabilityStatus === 'error'
          ? availabilityError || t('usage_stats.state_error')
          : t('common.loading');

  return (
    <Card
      title={t('usage_stats.request_events_title')}
      extra={
        <div className={styles.requestEventsActions}>
          {!canLoadDetails || detailsUnsupported ? null : !detailsOpened ? (
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
      {!canLoadDetails ? (
        <div className={styles.hint}>{availabilityText}</div>
      ) : detailsUnsupported ? (
        <div className={styles.hint}>{t('usage_stats.state_unsupported')}</div>
      ) : !detailsOpened ? (
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
              <Input
                value={sourceSearch}
                onChange={(event) => setSourceSearch(event.target.value)}
                placeholder={t('usage_stats.request_events_source_search')}
                aria-label={t('usage_stats.request_events_source_search')}
                className={styles.requestEventsSourceSearch}
              />
              <Select
                value={sourceFilter}
                options={sourceOptions}
                onChange={handleSourceFilterChange}
                className={styles.requestEventsSelect}
                ariaLabel={t('usage_stats.request_events_filter_source')}
                fullWidth={false}
              />
              {sourceFacetsLoading && (
                <span className={styles.requestEventsFilterHint}>{t('common.loading')}</span>
              )}
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
                      {hasServiceTierData && <th>{t('usage_stats.request_service_tier')}</th>}
                      {hasServiceTierData && <th>{t('usage_stats.response_service_tier')}</th>}
                      <th>{t('usage_stats.input_tokens')}</th>
                      <th>{t('usage_stats.output_tokens')}</th>
                      <th>{t('usage_stats.reasoning_tokens')}</th>
                      <th>{t('usage_stats.cached_tokens')}</th>
                      <th>{t('usage_stats.cache_creation_tokens')}</th>
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
                        {hasServiceTierData && <td>{row.requestServiceTier || '-'}</td>}
                        {hasServiceTierData && <td>{row.responseServiceTier || '-'}</td>}
                        <td>{row.inputTokens.toLocaleString()}</td>
                        <td>{row.outputTokens.toLocaleString()}</td>
                        <td>{row.reasoningTokens.toLocaleString()}</td>
                        <td>{row.cachedTokens.toLocaleString()}</td>
                        <td>{row.cacheCreationTokens.toLocaleString()}</td>
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
