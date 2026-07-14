import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Line } from 'react-chartjs-2';
import { Card } from '@/components/ui/Card';
import type { UsageTokensResponse } from '@/types';
import type { TokenBreakdownSeries, TokenCategory } from '@/utils/usage';
import { buildChartOptions, getHourChartMinWidth } from '@/utils/usage/chartConfig';
import type { UsageResource } from './hooks/useUsageData';
import styles from '@/pages/UsagePage.module.scss';

const TOKEN_COLORS: Record<TokenCategory, { border: string; bg: string }> = {
  input: { border: '#8b8680', bg: 'rgba(139, 134, 128, 0.25)' },
  output: { border: '#22c55e', bg: 'rgba(34, 197, 94, 0.25)' },
  cached: { border: '#f59e0b', bg: 'rgba(245, 158, 11, 0.25)' },
  cacheCreation: { border: '#0ea5e9', bg: 'rgba(14, 165, 233, 0.22)' },
  reasoning: { border: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.25)' },
};

const CATEGORIES: TokenCategory[] = ['input', 'output', 'cached', 'cacheCreation', 'reasoning'];

const toTokenNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const buildTokenBreakdown = (
  response: UsageTokensResponse | null,
  locale: string
): TokenBreakdownSeries => {
  const period = response?.bucket === 'day' ? 'day' : 'hour';
  const entries = (response?.items ?? [])
    .map((item) => {
      const bucket = String(item.bucket ?? '').trim();
      const tokens = item.tokens ?? {};
      return {
        bucket,
        input: toTokenNumber(tokens.input_tokens),
        output: toTokenNumber(tokens.output_tokens),
        cached: Math.max(toTokenNumber(tokens.cached_tokens), toTokenNumber(tokens.cache_tokens)),
        cacheCreation: toTokenNumber(tokens.cache_creation_tokens),
        reasoning: toTokenNumber(tokens.reasoning_tokens),
      };
    })
    .filter((item) => item.bucket)
    .sort((left, right) => new Date(left.bucket).getTime() - new Date(right.bucket).getTime());

  const labels = entries.map((item) => {
    const date = new Date(item.bucket);
    if (Number.isNaN(date.getTime())) return item.bucket;
    return period === 'hour'
      ? date.toLocaleString(locale, {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
      : date.toLocaleDateString(locale, { month: '2-digit', day: '2-digit' });
  });
  const dataByCategory: Record<TokenCategory, number[]> = {
    input: entries.map((item) => item.input),
    output: entries.map((item) => item.output),
    cached: entries.map((item) => item.cached),
    cacheCreation: entries.map((item) => item.cacheCreation),
    reasoning: entries.map((item) => item.reasoning),
  };

  return {
    labels,
    dataByCategory,
    hasData: CATEGORIES.some((category) => dataByCategory[category].some((value) => value > 0)),
  };
};

export interface TokenBreakdownChartProps {
  resource: UsageResource<UsageTokensResponse>;
  isDark: boolean;
  isMobile: boolean;
}

export function TokenBreakdownChart({ resource, isDark, isMobile }: TokenBreakdownChartProps) {
  const { t, i18n } = useTranslation();
  const period = resource.data?.bucket === 'day' ? 'day' : 'hour';

  const { chartData, chartOptions, hasData } = useMemo(() => {
    const series = buildTokenBreakdown(resource.data, i18n.language);
    const categoryLabels: Record<TokenCategory, string> = {
      input: t('usage_stats.input_tokens'),
      output: t('usage_stats.output_tokens'),
      cached: t('usage_stats.cached_tokens'),
      cacheCreation: t('usage_stats.cache_creation_tokens'),
      reasoning: t('usage_stats.reasoning_tokens'),
    };
    const data = {
      labels: series.labels,
      datasets: CATEGORIES.map((category) => ({
        label: categoryLabels[category],
        data: series.dataByCategory[category],
        borderColor: TOKEN_COLORS[category].border,
        backgroundColor: TOKEN_COLORS[category].bg,
        pointBackgroundColor: TOKEN_COLORS[category].border,
        pointBorderColor: TOKEN_COLORS[category].border,
        fill: true,
        tension: 0.35,
      })),
    };
    const baseOptions = buildChartOptions({ period, labels: series.labels, isDark, isMobile });
    return {
      chartData: data,
      hasData: series.hasData,
      chartOptions: {
        ...baseOptions,
        scales: {
          ...baseOptions.scales,
          y: { ...baseOptions.scales?.y, stacked: true },
          x: { ...baseOptions.scales?.x, stacked: true },
        },
      },
    };
  }, [i18n.language, isDark, isMobile, period, resource.data, t]);

  const stateText =
    resource.status === 'loading'
      ? t('common.loading')
      : resource.status === 'disabled'
        ? t('usage_stats.state_disabled')
        : resource.status === 'unsupported'
          ? t('usage_stats.state_unsupported')
          : resource.status === 'error'
            ? resource.error || t('usage_stats.state_error')
            : !hasData
              ? t('usage_stats.no_data')
              : '';

  return (
    <Card title={t('usage_stats.token_breakdown')}>
      {stateText ? (
        <div className={styles.hint}>{stateText}</div>
      ) : (
        <div className={styles.chartWrapper}>
          <div className={styles.chartLegend} aria-label={t('usage_stats.token_breakdown')}>
            {chartData.datasets.map((dataset) => (
              <div key={dataset.label} className={styles.legendItem} title={dataset.label}>
                <span
                  className={styles.legendDot}
                  style={{ backgroundColor: dataset.borderColor }}
                />
                <span className={styles.legendLabel}>{dataset.label}</span>
              </div>
            ))}
          </div>
          <div className={styles.chartArea}>
            <div className={styles.chartScroller}>
              <div
                className={styles.chartCanvas}
                style={
                  period === 'hour'
                    ? { minWidth: getHourChartMinWidth(chartData.labels.length, isMobile) }
                    : undefined
                }
              >
                <Line data={chartData} options={chartOptions} />
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
