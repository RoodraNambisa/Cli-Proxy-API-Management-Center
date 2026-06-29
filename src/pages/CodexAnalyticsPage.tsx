import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  type ChartOptions,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import { SecondaryScreenShell } from '@/components/common/SecondaryScreenShell';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Select, type SelectOption } from '@/components/ui/Select';
import { IconRefreshCw } from '@/components/ui/icons';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { authFilesApi, fetchCodexAnalytics } from '@/services/api';
import { useAuthStore, useThemeStore } from '@/stores';
import type { AuthFileItem, CodexAnalyticsSeriesDataset, CodexAnalyticsViewModel } from '@/types';
import { buildChartOptions } from '@/utils/usage/chartConfig';
import { normalizeAuthIndex } from '@/utils/usage';
import { resolveCodexChatgptAccountId } from '@/utils/quota/resolvers';
import { isCodexFile, isDisabledAuthFile } from '@/utils/quota/validators';
import styles from './CodexAnalyticsPage.module.scss';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend,
  Filler
);

type RangePreset = '7d' | '30d' | 'custom';

const SELECTED_AUTH_STORAGE_KEY = 'cli-proxy-codex-analytics-auth-v1';
const DEFAULT_RANGE_PRESET: RangePreset = '30d';

const padDatePart = (value: number): string => String(value).padStart(2, '0');

const formatDate = (date: Date): string =>
  `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;

const createRelativeRange = (days: number) => {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  return {
    startDate: formatDate(start),
    endDate: formatDate(end),
  };
};

const getStoredSelectedAuth = (): string => {
  try {
    return localStorage.getItem(SELECTED_AUTH_STORAGE_KEY) || '';
  } catch {
    return '';
  }
};

const storeSelectedAuth = (value: string) => {
  try {
    if (value) {
      localStorage.setItem(SELECTED_AUTH_STORAGE_KEY, value);
    } else {
      localStorage.removeItem(SELECTED_AUTH_STORAGE_KEY);
    }
  } catch {
    // Ignore unavailable localStorage.
  }
};

const getAuthFileKey = (file: AuthFileItem): string =>
  normalizeAuthIndex(file.auth_index ?? file.authIndex) || file.name;

const buildAuthLabel = (file: AuthFileItem): string => {
  const authIndex = normalizeAuthIndex(file.auth_index ?? file.authIndex);
  return authIndex ? `${file.name} (#${authIndex})` : file.name;
};

const hexToRgba = (color: string, alpha: number): string => {
  const normalized = color.replace('#', '');
  if (normalized.length !== 6) return color;
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const formatNumber = (value: number, options?: Intl.NumberFormatOptions): string =>
  new Intl.NumberFormat(undefined, options).format(value);

const formatCredits = (value: number): string =>
  formatNumber(value, { maximumFractionDigits: value >= 100 ? 0 : 2 });

const buildChartMinWidth = (labelCount: number, isMobile: boolean): string | undefined => {
  if (labelCount <= 14) return undefined;
  return `${Math.min(labelCount * (isMobile ? 40 : 32), 3200)}px`;
};

const buildStackedLineOptions = ({
  labels,
  isDark,
  isMobile,
}: {
  labels: string[];
  isDark: boolean;
  isMobile: boolean;
}): ChartOptions<'line'> => {
  const base = buildChartOptions({ period: 'day', labels, isDark, isMobile });
  return {
    ...base,
    scales: {
      ...base.scales,
      y: {
        ...base.scales?.y,
        stacked: true,
        beginAtZero: true,
      },
    },
  };
};

const buildStackedBarOptions = ({
  labels,
  isDark,
  isMobile,
}: {
  labels: string[];
  isDark: boolean;
  isMobile: boolean;
}): ChartOptions<'bar'> => {
  const tickFontSize = isMobile ? 10 : 12;
  const maxTickLabelCount = isMobile ? 6 : 10;
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(17, 24, 39, 0.06)';
  const axisBorderColor = isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(17, 24, 39, 0.10)';
  const tickColor = isDark ? 'rgba(255, 255, 255, 0.72)' : 'rgba(17, 24, 39, 0.72)';
  const tooltipBg = isDark ? 'rgba(17, 24, 39, 0.92)' : 'rgba(255, 255, 255, 0.98)';
  const tooltipTitle = isDark ? '#ffffff' : '#111827';
  const tooltipBody = isDark ? 'rgba(255, 255, 255, 0.86)' : '#374151';
  const tooltipBorder = isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(17, 24, 39, 0.10)';

  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: tooltipBg,
        titleColor: tooltipTitle,
        bodyColor: tooltipBody,
        borderColor: tooltipBorder,
        borderWidth: 1,
        padding: 10,
        displayColors: true,
      },
    },
    scales: {
      x: {
        stacked: true,
        grid: { color: gridColor, drawTicks: false },
        border: { color: axisBorderColor },
        ticks: {
          color: tickColor,
          font: { size: tickFontSize },
          autoSkip: true,
          maxRotation: isMobile ? 0 : 45,
          maxTicksLimit: maxTickLabelCount,
          callback: (value) => {
            const index = typeof value === 'number' ? value : Number(value);
            const raw = Number.isFinite(index) && labels[index] ? labels[index] : String(value);
            if (!isMobile) return raw;
            const parts = raw.split('-');
            return parts.length === 3 ? `${parts[1]}-${parts[2]}` : raw;
          },
        },
      },
      y: {
        stacked: true,
        beginAtZero: true,
        grid: { color: gridColor },
        border: { color: axisBorderColor },
        ticks: { color: tickColor, font: { size: tickFontSize } },
      },
    },
  };
};

function SeriesLegend({ series }: { series: CodexAnalyticsSeriesDataset[] }) {
  return (
    <div className={styles.chartLegend}>
      {series.map((item) => (
        <div className={styles.legendItem} key={item.key} title={item.label}>
          <span className={styles.legendDot} style={{ backgroundColor: item.color }} />
          <span className={styles.legendLabel}>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function ChartFrame({
  title,
  children,
  legend,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  legend?: ReactNode;
  wide?: boolean;
}) {
  return (
    <Card className={[styles.chartCard, wide ? styles.chartCardWide : ''].filter(Boolean).join(' ')}>
      <div className={styles.chartHeader}>
        <h2>{title}</h2>
      </div>
      {children}
      {legend}
    </Card>
  );
}

export function CodexAnalyticsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const isDark = resolvedTheme === 'dark';
  const defaultRange = useMemo(() => createRelativeRange(30), []);
  const requestIdRef = useRef(0);
  const loadingRef = useRef(false);

  const [authFiles, setAuthFiles] = useState<AuthFileItem[]>([]);
  const [selectedAuthKey, setSelectedAuthKey] = useState('');
  const [rangePreset, setRangePreset] = useState<RangePreset>(DEFAULT_RANGE_PRESET);
  const [customStartDate, setCustomStartDate] = useState(defaultRange.startDate);
  const [customEndDate, setCustomEndDate] = useState(defaultRange.endDate);
  const [data, setData] = useState<CodexAnalyticsViewModel | null>(null);
  const [loading, setLoading] = useState(false);
  const [filesLoading, setFilesLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);

  const selectedFile = useMemo(
    () => authFiles.find((file) => getAuthFileKey(file) === selectedAuthKey) ?? null,
    [authFiles, selectedAuthKey]
  );

  const dateRange = useMemo(() => {
    if (rangePreset === '7d') return createRelativeRange(7);
    if (rangePreset === '30d') return createRelativeRange(30);
    return { startDate: customStartDate, endDate: customEndDate };
  }, [customEndDate, customStartDate, rangePreset]);

  const rangeError = useMemo(() => {
    if (rangePreset !== 'custom') return '';
    if (!customStartDate || !customEndDate) return t('codex_analytics.invalid_range');
    if (customStartDate > customEndDate) return t('codex_analytics.invalid_range');
    return '';
  }, [customEndDate, customStartDate, rangePreset, t]);

  const authOptions = useMemo<SelectOption[]>(
    () =>
      authFiles.map((file) => ({
        value: getAuthFileKey(file),
        label: buildAuthLabel(file),
      })),
    [authFiles]
  );

  const rangeOptions = useMemo<SelectOption[]>(
    () => [
      { value: '7d', label: t('codex_analytics.range_7d') },
      { value: '30d', label: t('codex_analytics.range_30d') },
      { value: 'custom', label: t('codex_analytics.range_custom') },
    ],
    [t]
  );

  const canRequestAnalytics =
    connectionStatus === 'connected' && !rangeError && Boolean(selectedFile);
  const refreshDisabled = loading || !canRequestAnalytics;

  const loadAuthFiles = useCallback(async () => {
    setFilesLoading(true);
    setError('');
    try {
      const response = await authFilesApi.list();
      const nextFiles = (response?.files || []).filter(
        (file) => isCodexFile(file) && !isDisabledAuthFile(file)
      );
      const nextKeys = new Set(nextFiles.map(getAuthFileKey));
      setAuthFiles(nextFiles);
      setSelectedAuthKey((current) => {
        if (current && nextKeys.has(current)) return current;
        const stored = getStoredSelectedAuth();
        if (stored && nextKeys.has(stored)) return stored;
        return nextFiles[0] ? getAuthFileKey(nextFiles[0]) : '';
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('codex_analytics.load_failed');
      setError(message);
    } finally {
      setFilesLoading(false);
    }
  }, [t]);

  const loadAnalytics = useCallback(async () => {
    if (connectionStatus !== 'connected' || rangeError || !selectedFile) return;
    if (loadingRef.current) return;

    const authIndex = normalizeAuthIndex(selectedFile.auth_index ?? selectedFile.authIndex);
    if (!authIndex) {
      setError(t('codex_analytics.missing_auth_index'));
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    loadingRef.current = true;
    setLoading(true);
    setError('');

    try {
      const nextData = await fetchCodexAnalytics({
        authIndex,
        accountId: resolveCodexChatgptAccountId(selectedFile) || undefined,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      });
      if (requestIdRef.current !== requestId) return;
      setData(nextData);
      setLastRefreshedAt(new Date());
    } catch (err: unknown) {
      if (requestIdRef.current !== requestId) return;
      const message = err instanceof Error ? err.message : t('codex_analytics.load_failed');
      setError(message);
    } finally {
      if (requestIdRef.current === requestId) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  }, [connectionStatus, dateRange.endDate, dateRange.startDate, rangeError, selectedFile, t]);

  useHeaderRefresh(loadAnalytics, canRequestAnalytics);

  useEffect(() => {
    loadAuthFiles();
  }, [loadAuthFiles]);

  useEffect(() => {
    storeSelectedAuth(selectedAuthKey);
  }, [selectedAuthKey]);

  useEffect(() => {
    if (filesLoading || !canRequestAnalytics) return;
    loadAnalytics();
  }, [
    canRequestAnalytics,
    dateRange.endDate,
    dateRange.startDate,
    filesLoading,
    loadAnalytics,
    selectedAuthKey,
  ]);

  const chartMinWidth = buildChartMinWidth(data?.labels.length ?? 0, isMobile);

  const surfaceChartData = useMemo(
    () => ({
      labels: data?.labels ?? [],
      datasets:
        data?.surfaceSeries.map((series) => ({
          label: series.label,
          data: series.values,
          stack: 'surface',
          backgroundColor: hexToRgba(series.color, 0.82),
          borderColor: series.color,
          borderWidth: 1,
          borderRadius: 3,
          maxBarThickness: 32,
        })) ?? [],
    }),
    [data]
  );

  const modelChartData = useMemo(
    () => ({
      labels: data?.labels ?? [],
      datasets:
        data?.modelCreditSeries.map((series) => ({
          label: series.label,
          data: series.values,
          borderColor: series.color,
          backgroundColor: hexToRgba(series.color, 0.18),
          fill: true,
          tension: 0.35,
          pointRadius: isMobile ? 0 : 2,
        })) ?? [],
    }),
    [data, isMobile]
  );

  const skillChartData = useMemo(
    () => ({
      labels: data?.labels ?? [],
      datasets:
        data?.skillInvocationSeries.map((series) => ({
          label: series.label,
          data: series.values,
          borderColor: series.color,
          backgroundColor: hexToRgba(series.color, 0.16),
          fill: true,
          tension: 0.35,
          pointRadius: isMobile ? 0 : 2,
        })) ?? [],
    }),
    [data, isMobile]
  );

  const pluginChartData = useMemo(
    () => ({
      labels: data?.labels ?? [],
      datasets:
        data?.pluginInvocationSeries.map((series) => ({
          label: series.label,
          data: series.values,
          borderColor: series.color,
          backgroundColor: hexToRgba(series.color, 0.16),
          fill: true,
          tension: 0.35,
          pointRadius: isMobile ? 0 : 2,
        })) ?? [],
    }),
    [data, isMobile]
  );

  const barOptions = useMemo(
    () => buildStackedBarOptions({ labels: data?.labels ?? [], isDark, isMobile }),
    [data?.labels, isDark, isMobile]
  );

  const lineOptions = useMemo(
    () => buildStackedLineOptions({ labels: data?.labels ?? [], isDark, isMobile }),
    [data?.labels, isDark, isMobile]
  );

  const summaryCards = [
    {
      key: 'credits',
      label: t('codex_analytics.summary_credits'),
      value: data ? formatCredits(data.totals.credits) : '-',
    },
    {
      key: 'turns',
      label: t('codex_analytics.summary_turns'),
      value: data ? formatNumber(data.totals.turns) : '-',
    },
    {
      key: 'threads',
      label: t('codex_analytics.summary_threads'),
      value: data ? formatNumber(data.totals.threads) : '-',
    },
    {
      key: 'tokens',
      label: t('codex_analytics.summary_tokens'),
      value: data ? formatNumber(data.totals.textTotalTokens) : '-',
    },
  ];

  const renderChartContent = (
    hasSeries: boolean,
    chart: React.ReactNode,
    emptyDescription = t('codex_analytics.no_data')
  ) => {
    if (!data || !hasSeries) {
      return <div className={styles.chartEmpty}>{emptyDescription}</div>;
    }
    return (
      <div className={styles.chartScroller}>
        <div className={styles.chartCanvas} style={{ minWidth: chartMinWidth }}>
          {chart}
        </div>
      </div>
    );
  };

  const lastUpdatedText = lastRefreshedAt
    ? t('codex_analytics.last_updated', {
        time: lastRefreshedAt.toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }),
      })
    : '';

  const rightAction = (
    <Button
      variant="secondary"
      size="sm"
      onClick={loadAnalytics}
      loading={loading}
      disabled={refreshDisabled}
      className={styles.refreshButton}
    >
      <IconRefreshCw size={15} />
      {t('codex_analytics.refresh')}
    </Button>
  );

  return (
    <SecondaryScreenShell
      title={t('codex_analytics.title')}
      backLabel={t('codex_analytics.back_to_quota')}
      onBack={() => navigate('/quota')}
      rightAction={rightAction}
    >
      <div className={styles.container}>
        <Card className={styles.toolbarCard}>
          <div className={styles.toolbarHeader}>
            <div>
              <h1>{t('codex_analytics.title')}</h1>
              <p>{t('codex_analytics.subtitle')}</p>
            </div>
            {lastUpdatedText && <span className={styles.lastUpdated}>{lastUpdatedText}</span>}
          </div>

          <div className={styles.toolbarGrid}>
            <div className={styles.controlGroup}>
              <label>{t('codex_analytics.auth_label')}</label>
              <Select
                value={selectedAuthKey}
                options={authOptions}
                onChange={setSelectedAuthKey}
                placeholder={t('codex_analytics.auth_placeholder')}
                disabled={filesLoading || authOptions.length === 0}
                ariaLabel={t('codex_analytics.auth_label')}
              />
            </div>
            <div className={styles.controlGroup}>
              <label>{t('codex_analytics.range_label')}</label>
              <Select
                value={rangePreset}
                options={rangeOptions}
                onChange={(value) => setRangePreset(value as RangePreset)}
                ariaLabel={t('codex_analytics.range_label')}
              />
            </div>
            {rangePreset === 'custom' && (
              <>
                <Input
                  type="date"
                  label={t('codex_analytics.start_date')}
                  value={customStartDate}
                  onChange={(event) => setCustomStartDate(event.target.value)}
                />
                <Input
                  type="date"
                  label={t('codex_analytics.end_date')}
                  value={customEndDate}
                  onChange={(event) => setCustomEndDate(event.target.value)}
                  error={rangeError || undefined}
                />
              </>
            )}
          </div>
          {rangePreset === 'custom' && !rangeError && (
            <div className={styles.toolbarHint}>{t('codex_analytics.custom_range_hint')}</div>
          )}
        </Card>

        {error && <div className={styles.errorBox}>{error}</div>}

        {!filesLoading && authOptions.length === 0 ? (
          <EmptyState
            title={t('codex_analytics.no_auth_title')}
            description={t('codex_analytics.no_auth_desc')}
          />
        ) : (
          <>
            <div className={styles.summaryGrid}>
              {summaryCards.map((card) => (
                <div className={styles.summaryCard} key={card.key}>
                  <span className={styles.summaryLabel}>{card.label}</span>
                  <span className={styles.summaryValue}>{card.value}</span>
                </div>
              ))}
            </div>

            <div className={styles.chartGrid} aria-busy={loading}>
              <ChartFrame title={t('codex_analytics.surface_usage')} wide>
                {renderChartContent(
                  Boolean(data?.surfaceSeries.length),
                  <Bar data={surfaceChartData} options={barOptions} />
                )}
                {data?.surfaceSeries.length ? <SeriesLegend series={data.surfaceSeries} /> : null}
              </ChartFrame>

              <ChartFrame title={t('codex_analytics.model_credits')} wide>
                {renderChartContent(
                  Boolean(data?.modelCreditSeries.length),
                  <Line data={modelChartData} options={lineOptions} />
                )}
                {data?.modelCreditSeries.length ? (
                  <SeriesLegend series={data.modelCreditSeries} />
                ) : null}
              </ChartFrame>

              <ChartFrame title={t('codex_analytics.skills_used')} wide>
                {renderChartContent(
                  Boolean(data?.skillInvocationSeries.length),
                  <Line data={skillChartData} options={lineOptions} />
                )}
                {data?.skillInvocationSeries.length ? (
                  <SeriesLegend series={data.skillInvocationSeries} />
                ) : null}
              </ChartFrame>

              <ChartFrame title={t('codex_analytics.plugins_calls')} wide>
                {renderChartContent(
                  Boolean(data?.pluginInvocationSeries.length),
                  <Line data={pluginChartData} options={lineOptions} />,
                  t('codex_analytics.no_plugin_data')
                )}
                {data?.pluginInvocationSeries.length ? (
                  <SeriesLegend series={data.pluginInvocationSeries} />
                ) : null}
              </ChartFrame>
            </div>
          </>
        )}
      </div>
    </SecondaryScreenShell>
  );
}
