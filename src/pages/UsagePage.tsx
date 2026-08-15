import { useState, useMemo, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { providersApi } from '@/services/api';
import { useThemeStore, useConfigStore } from '@/stores';
import type { OpenAIProviderConfig } from '@/types';
import {
  StatCards,
  UsageChart,
  ChartLineSelector,
  ApiDetailsCard,
  ModelStatsCard,
  PriceSettingsCard,
  CredentialStatsCard,
  RequestEventsDetailsCard,
  TokenBreakdownChart,
  CostTrendChart,
  ServiceHealthCard,
  FailureSummaryCard,
  useUsageData,
  useSparklines,
  useChartData,
} from '@/components/usage';
import {
  getModelNamesFromUsage,
  getApiStats,
  getModelStats,
  type UsageTimeRange,
} from '@/utils/usage';
import styles from './UsagePage.module.scss';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const CHART_LINES_STORAGE_KEY = 'cli-proxy-usage-chart-lines-v1';
const TIME_RANGE_STORAGE_KEY = 'cli-proxy-usage-time-range-v1';
const DEFAULT_CHART_LINES = ['all'];
const DEFAULT_TIME_RANGE: UsageTimeRange = '24h';
const MAX_CHART_LINES = 9;
const TIME_RANGE_OPTIONS: ReadonlyArray<{ value: UsageTimeRange; labelKey: string }> = [
  { value: 'all', labelKey: 'usage_stats.range_all' },
  { value: '7h', labelKey: 'usage_stats.range_7h' },
  { value: '24h', labelKey: 'usage_stats.range_24h' },
  { value: '7d', labelKey: 'usage_stats.range_7d' },
];
const isUsageTimeRange = (value: unknown): value is UsageTimeRange =>
  value === '7h' || value === '24h' || value === '7d' || value === 'all';

const normalizeChartLines = (value: unknown, maxLines = MAX_CHART_LINES): string[] => {
  if (!Array.isArray(value)) {
    return DEFAULT_CHART_LINES;
  }

  const filtered = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxLines);

  return filtered.length ? filtered : DEFAULT_CHART_LINES;
};

const loadChartLines = (): string[] => {
  try {
    if (typeof localStorage === 'undefined') {
      return DEFAULT_CHART_LINES;
    }
    const raw = localStorage.getItem(CHART_LINES_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_CHART_LINES;
    }
    return normalizeChartLines(JSON.parse(raw));
  } catch {
    return DEFAULT_CHART_LINES;
  }
};

const loadTimeRange = (): UsageTimeRange => {
  try {
    if (typeof localStorage === 'undefined') {
      return DEFAULT_TIME_RANGE;
    }
    const raw = localStorage.getItem(TIME_RANGE_STORAGE_KEY);
    return isUsageTimeRange(raw) ? raw : DEFAULT_TIME_RANGE;
  } catch {
    return DEFAULT_TIME_RANGE;
  }
};

export function UsagePage() {
  const { t } = useTranslation();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const isDark = resolvedTheme === 'dark';
  const config = useConfigStore((state) => state.config);
  const openaiCompatibilityConfig = config?.openaiCompatibility;
  const [openaiProvidersWithAuthIndex, setOpenaiProvidersWithAuthIndex] = useState<{
    source: OpenAIProviderConfig[] | undefined;
    providers: OpenAIProviderConfig[];
  } | null>(null);

  // Chart lines and time range state
  const [chartLines, setChartLines] = useState<string[]>(loadChartLines);
  const [timeRange, setTimeRange] = useState<UsageTimeRange>(loadTimeRange);
  // Data hook
  const {
    usage,
    authUsage,
    authResource,
    authQuery,
    authPagination,
    loading,
    authUsageLoading,
    setAuthPage,
    setAuthPageSize,
    setAuthSearch,
    setAuthSort,
    error,
    lastRefreshedAt,
    modelPrices,
    summaryResource,
    healthResource,
    failureResource,
    ratesResource,
    tokensResource,
    costsResource,
    pricesResource,
    querySnapshot,
    legacyPriceImportAvailable,
    loadUsage,
    handleExport,
    handleImport,
    handleImportChange,
    handleClearUsage,
    importInputRef,
    exporting,
    importing,
    clearing,
  } = useUsageData({ timeRange });

  useHeaderRefresh(loadUsage);

  useEffect(() => {
    let cancelled = false;
    const source = openaiCompatibilityConfig;

    providersApi
      .getOpenAIProviders()
      .then((providers) => {
        if (cancelled) return;
        setOpenaiProvidersWithAuthIndex({ source, providers: providers || [] });
      })
      .catch(() => {
        if (cancelled) return;
        setOpenaiProvidersWithAuthIndex(null);
      });

    return () => {
      cancelled = true;
    };
  }, [openaiCompatibilityConfig]);

  const openaiProviderState = openaiProvidersWithAuthIndex;
  const openaiProvidersForUsage =
    openaiProviderState && openaiProviderState.source === openaiCompatibilityConfig
      ? openaiProviderState.providers
      : (openaiCompatibilityConfig ?? []);

  const timeRangeOptions = useMemo(
    () =>
      TIME_RANGE_OPTIONS.map((opt) => ({
        value: opt.value,
        label: t(opt.labelKey),
      })),
    [t]
  );

  const filteredUsage = usage;
  const usageRange = querySnapshot.range;

  const handleChartLinesChange = useCallback((lines: string[]) => {
    setChartLines(normalizeChartLines(lines));
  }, []);

  useEffect(() => {
    try {
      if (typeof localStorage === 'undefined') {
        return;
      }
      localStorage.setItem(CHART_LINES_STORAGE_KEY, JSON.stringify(chartLines));
    } catch {
      // Ignore storage errors.
    }
  }, [chartLines]);

  useEffect(() => {
    try {
      if (typeof localStorage === 'undefined') {
        return;
      }
      localStorage.setItem(TIME_RANGE_STORAGE_KEY, timeRange);
    } catch {
      // Ignore storage errors.
    }
  }, [timeRange]);

  // Sparklines hook
  const { requestsSparkline, tokensSparkline, rpmSparkline, tpmSparkline, costSparkline } =
    useSparklines({ ratesResource, costsResource });

  // Chart data hook
  const {
    requestsPeriod,
    setRequestsPeriod,
    tokensPeriod,
    setTokensPeriod,
    requestsChartData,
    tokensChartData,
    requestsChartOptions,
    tokensChartOptions,
    loading: chartLoading,
    status: chartStatus,
    error: chartError,
  } = useChartData({
    chartLines,
    isDark,
    isMobile,
    range: usageRange,
    availabilityStatus: summaryResource.status,
    availabilityError: summaryResource.error,
  });

  // Derived data
  const modelNames = useMemo(() => getModelNamesFromUsage(usage), [usage]);
  const sourceNames = useMemo(() => {
    const sources = usage?.sources;
    return sources && typeof sources === 'object' && !Array.isArray(sources)
      ? Object.keys(sources)
      : [];
  }, [usage]);
  const apiStats = useMemo(() => {
    const costs = new Map(
      (costsResource.data?.by_api ?? []).map((item) => [
        item.api ?? '',
        Number.isFinite(Number(item.cost?.amount_micros))
          ? Number(item.cost?.amount_micros) / 1_000_000
          : Number(item.cost?.amount) || 0,
      ])
    );
    return getApiStats(filteredUsage, {}).map((item) => ({
      ...item,
      totalCost: costs.get(item.endpoint) ?? 0,
    }));
  }, [costsResource.data, filteredUsage]);
  const modelStats = useMemo(() => {
    const costs = new Map(
      (costsResource.data?.by_model ?? []).map((item) => [
        item.model ?? '',
        Number.isFinite(Number(item.cost?.amount_micros))
          ? Number(item.cost?.amount_micros) / 1_000_000
          : Number(item.cost?.amount) || 0,
      ])
    );
    return getModelStats(filteredUsage, {}).map((item) => ({
      ...item,
      cost: costs.get(item.model) ?? 0,
    }));
  }, [costsResource.data, filteredUsage]);
  const hasPrices = Object.keys(modelPrices).length > 0;
  const summaryStateText =
    summaryResource.status === 'disabled'
      ? t('usage_stats.state_disabled')
      : summaryResource.status === 'unsupported'
        ? t('usage_stats.state_unsupported')
        : summaryResource.status === 'empty'
          ? t('usage_stats.state_empty')
          : '';
  const chartEmptyText =
    chartStatus === 'disabled'
      ? t('usage_stats.state_disabled')
      : chartStatus === 'unsupported'
        ? t('usage_stats.state_unsupported')
        : chartStatus === 'error'
          ? chartError || t('usage_stats.state_error')
          : t('usage_stats.no_data');

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.pageTitle}>{t('usage_stats.title')}</h1>
        <div className={styles.headerActions}>
          <div className={styles.timeRangeGroup}>
            <span className={styles.timeRangeLabel}>{t('usage_stats.range_filter')}</span>
            <Select
              value={timeRange}
              options={timeRangeOptions}
              onChange={(value) => setTimeRange(value as UsageTimeRange)}
              className={styles.timeRangeSelectControl}
              ariaLabel={t('usage_stats.range_filter')}
              fullWidth={false}
            />
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExport}
            loading={exporting}
            disabled={loading || importing || clearing}
          >
            {t('usage_stats.export')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleImport}
            loading={importing}
            disabled={loading || exporting || clearing}
          >
            {t('usage_stats.import')}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={handleClearUsage}
            loading={clearing}
            disabled={loading || exporting || importing || clearing}
          >
            {t('usage_stats.clear_usage')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void loadUsage().catch(() => {})}
            disabled={loading || exporting || importing || clearing}
          >
            {loading ? t('common.loading') : t('usage_stats.refresh')}
          </Button>
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={handleImportChange}
          />
          {lastRefreshedAt && (
            <span className={styles.lastRefreshed}>
              {t('usage_stats.last_updated')}: {lastRefreshedAt.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {error && <div className={styles.errorBox}>{error}</div>}
      {summaryStateText && <div className={styles.usageStateBanner}>{summaryStateText}</div>}

      {/* Stats Overview Cards */}
      <StatCards
        usage={filteredUsage}
        loading={loading}
        ratesResource={ratesResource}
        tokensResource={tokensResource}
        costsResource={costsResource}
        sparklines={{
          requests: requestsSparkline,
          tokens: tokensSparkline,
          rpm: rpmSparkline,
          tpm: tpmSparkline,
          cost: costSparkline,
        }}
      />

      {/* Chart Line Selection */}
      <ChartLineSelector
        chartLines={chartLines}
        modelNames={modelNames}
        maxLines={MAX_CHART_LINES}
        onChange={handleChartLinesChange}
      />

      {/* Service Health */}
      <ServiceHealthCard resource={healthResource} />

      <FailureSummaryCard resource={failureResource} />

      {/* Charts Grid */}
      <div className={styles.chartsGrid}>
        <UsageChart
          title={t('usage_stats.requests_trend')}
          period={requestsPeriod}
          onPeriodChange={setRequestsPeriod}
          chartData={requestsChartData}
          chartOptions={requestsChartOptions}
          loading={loading || chartLoading}
          isMobile={isMobile}
          emptyText={chartEmptyText}
        />
        <UsageChart
          title={t('usage_stats.tokens_trend')}
          period={tokensPeriod}
          onPeriodChange={setTokensPeriod}
          chartData={tokensChartData}
          chartOptions={tokensChartOptions}
          loading={loading || chartLoading}
          isMobile={isMobile}
          emptyText={chartEmptyText}
        />
      </div>

      {/* Token Breakdown Chart */}
      <TokenBreakdownChart resource={tokensResource} isDark={isDark} isMobile={isMobile} />

      {/* Cost Trend Chart */}
      <CostTrendChart resource={costsResource} isDark={isDark} isMobile={isMobile} />

      {/* Details Grid */}
      <div className={styles.detailsGrid}>
        <ApiDetailsCard apiStats={apiStats} loading={loading} hasPrices={hasPrices} />
        <ModelStatsCard modelStats={modelStats} loading={loading} hasPrices={hasPrices} />
      </div>

      <RequestEventsDetailsCard
        loading={loading}
        geminiKeys={config?.geminiApiKeys || []}
        interactionsKeys={config?.interactionsApiKeys || []}
        claudeConfigs={config?.claudeApiKeys || []}
        codexConfigs={config?.codexApiKeys || []}
        vertexConfigs={config?.vertexApiKeys || []}
        openaiProviders={openaiProvidersForUsage}
        range={usageRange}
        availableModels={modelNames}
        availableSources={sourceNames}
        authSummaries={authUsage}
        availabilityStatus={summaryResource.status}
        availabilityError={summaryResource.error}
      />

      {/* Credential Stats */}
      <CredentialStatsCard
        authUsage={authUsage}
        loading={authUsageLoading}
        error={authResource.status === 'error' ? authResource.error : ''}
        query={authQuery}
        pagination={authPagination}
        onPageChange={setAuthPage}
        onPageSizeChange={setAuthPageSize}
        onSearchChange={setAuthSearch}
        onSortChange={setAuthSort}
      />

      {/* Price Settings */}
      <PriceSettingsCard
        modelNames={modelNames}
        modelPrices={modelPrices}
        resource={pricesResource}
        legacyImportAvailable={legacyPriceImportAvailable}
        onChanged={loadUsage}
      />
    </div>
  );
}
