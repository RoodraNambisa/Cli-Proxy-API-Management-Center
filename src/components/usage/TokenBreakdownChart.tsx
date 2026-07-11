import { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Line } from 'react-chartjs-2';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  buildHourlyTokenBreakdown,
  buildDailyTokenBreakdown,
  type TokenBreakdownSeries,
  type TokenCategory,
} from '@/utils/usage';
import { usageApi } from '@/services/api/usage';
import type { UsageRangeQuery, UsageSeriesResponse } from '@/types';
import { buildChartOptions, getHourChartMinWidth } from '@/utils/usage/chartConfig';
import type { UsagePayload } from './hooks/useUsageData';
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

const buildSeriesTokenBreakdown = (
  response: UsageSeriesResponse,
  period: 'hour' | 'day',
  locale: string
): TokenBreakdownSeries => {
  const buckets = new Map<string, Record<TokenCategory, number>>();
  (response.items ?? []).forEach((item) => {
    const bucket = String(item.bucket ?? '').trim();
    if (!bucket) return;
    const values = buckets.get(bucket) ?? {
      input: 0,
      output: 0,
      cached: 0,
      cacheCreation: 0,
      reasoning: 0,
    };
    const tokens = item.tokens ?? {};
    values.input += toTokenNumber(tokens.input_tokens);
    values.output += toTokenNumber(tokens.output_tokens);
    values.cached += Math.max(
      toTokenNumber(tokens.cached_tokens),
      toTokenNumber(tokens.cache_tokens)
    );
    values.cacheCreation += toTokenNumber(tokens.cache_creation_tokens);
    values.reasoning += toTokenNumber(tokens.reasoning_tokens);
    buckets.set(bucket, values);
  });

  const entries = Array.from(buckets.entries()).sort(
    ([left], [right]) => new Date(left).getTime() - new Date(right).getTime()
  );
  const labels = entries.map(([bucket]) => {
    const date = new Date(bucket);
    if (Number.isNaN(date.getTime())) return bucket;
    return period === 'hour'
      ? date.toLocaleString(locale, {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
      : date.toLocaleDateString(locale, { month: '2-digit', day: '2-digit' });
  });
  const dataByCategory = Object.fromEntries(
    CATEGORIES.map((category) => [category, entries.map(([, values]) => values[category])])
  ) as Record<TokenCategory, number[]>;
  const hasData = CATEGORIES.some((category) =>
    dataByCategory[category].some((value) => value > 0)
  );

  return { labels, dataByCategory, hasData };
};

export interface TokenBreakdownChartProps {
  usage: UsagePayload | null;
  loading: boolean;
  isDark: boolean;
  isMobile: boolean;
  hourWindowHours?: number;
  range: UsageRangeQuery;
}

export function TokenBreakdownChart({
  usage,
  loading,
  isDark,
  isMobile,
  hourWindowHours,
  range,
}: TokenBreakdownChartProps) {
  const { t, i18n } = useTranslation();
  const [period, setPeriod] = useState<'hour' | 'day'>('hour');
  const [seriesResponse, setSeriesResponse] = useState<UsageSeriesResponse | null>(null);
  const [seriesLoading, setSeriesLoading] = useState(false);
  const rangeFrom = range.from;
  const rangeTo = range.to;

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setSeriesLoading(true);
      usageApi
        .getUsageSeries({
          from: rangeFrom,
          to: rangeTo,
          bucket: period,
          group_by: 'model',
        })
        .then((response) => {
          if (!cancelled) setSeriesResponse(response);
        })
        .catch(() => {
          if (!cancelled) setSeriesResponse(null);
        })
        .finally(() => {
          if (!cancelled) setSeriesLoading(false);
        });
    });

    return () => {
      cancelled = true;
    };
  }, [period, rangeFrom, rangeTo]);

  const { chartData, chartOptions } = useMemo(() => {
    const series = seriesResponse
      ? buildSeriesTokenBreakdown(seriesResponse, period, i18n.language)
      : period === 'hour'
        ? buildHourlyTokenBreakdown(usage, hourWindowHours)
        : buildDailyTokenBreakdown(usage);
    const categoryLabels: Record<TokenCategory, string> = {
      input: t('usage_stats.input_tokens'),
      output: t('usage_stats.output_tokens'),
      cached: t('usage_stats.cached_tokens'),
      cacheCreation: t('usage_stats.cache_creation_tokens'),
      reasoning: t('usage_stats.reasoning_tokens'),
    };

    const data = {
      labels: series.labels,
      datasets: CATEGORIES.map((cat) => ({
        label: categoryLabels[cat],
        data: series.dataByCategory[cat],
        borderColor: TOKEN_COLORS[cat].border,
        backgroundColor: TOKEN_COLORS[cat].bg,
        pointBackgroundColor: TOKEN_COLORS[cat].border,
        pointBorderColor: TOKEN_COLORS[cat].border,
        fill: true,
        tension: 0.35,
      })),
    };

    const baseOptions = buildChartOptions({ period, labels: series.labels, isDark, isMobile });
    const options = {
      ...baseOptions,
      scales: {
        ...baseOptions.scales,
        y: {
          ...baseOptions.scales?.y,
          stacked: true,
        },
        x: {
          ...baseOptions.scales?.x,
          stacked: true,
        },
      },
    };

    return { chartData: data, chartOptions: options };
  }, [usage, seriesResponse, period, isDark, isMobile, hourWindowHours, i18n.language, t]);

  return (
    <Card
      title={t('usage_stats.token_breakdown')}
      extra={
        <div className={styles.periodButtons}>
          <Button
            variant={period === 'hour' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setPeriod('hour')}
          >
            {t('usage_stats.by_hour')}
          </Button>
          <Button
            variant={period === 'day' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setPeriod('day')}
          >
            {t('usage_stats.by_day')}
          </Button>
        </div>
      }
    >
      {loading || seriesLoading ? (
        <div className={styles.hint}>{t('common.loading')}</div>
      ) : chartData.labels.length > 0 ? (
        <div className={styles.chartWrapper}>
          <div className={styles.chartLegend} aria-label="Chart legend">
            {chartData.datasets.map((dataset, index) => (
              <div
                key={`${dataset.label}-${index}`}
                className={styles.legendItem}
                title={dataset.label}
              >
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
      ) : (
        <div className={styles.hint}>{t('usage_stats.no_data')}</div>
      )}
    </Card>
  );
}
