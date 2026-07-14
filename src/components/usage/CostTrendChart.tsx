import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ScriptableContext } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { Card } from '@/components/ui/Card';
import type { UsageCostsResponse } from '@/types';
import { formatUsd } from '@/utils/usage';
import { buildChartOptions, getHourChartMinWidth } from '@/utils/usage/chartConfig';
import type { UsageResource } from './hooks/useUsageData';
import styles from '@/pages/UsagePage.module.scss';

export interface CostTrendChartProps {
  resource: UsageResource<UsageCostsResponse>;
  isDark: boolean;
  isMobile: boolean;
}

const COST_COLOR = '#f59e0b';
const COST_BG = 'rgba(245, 158, 11, 0.15)';

const moneyAmount = (amountMicros: unknown, amount: unknown): number => {
  const micros = Number(amountMicros);
  if (Number.isFinite(micros)) return micros / 1_000_000;
  const fallback = Number(amount);
  return Number.isFinite(fallback) ? fallback : 0;
};

function buildGradient(context: ScriptableContext<'line'>) {
  const { chart } = context;
  if (!chart.chartArea) return COST_BG;
  const gradient = chart.ctx.createLinearGradient(
    0,
    chart.chartArea.top,
    0,
    chart.chartArea.bottom
  );
  gradient.addColorStop(0, 'rgba(245, 158, 11, 0.28)');
  gradient.addColorStop(0.6, 'rgba(245, 158, 11, 0.12)');
  gradient.addColorStop(1, 'rgba(245, 158, 11, 0.02)');
  return gradient;
}

export function CostTrendChart({ resource, isDark, isMobile }: CostTrendChartProps) {
  const { t, i18n } = useTranslation();
  const period = resource.data?.bucket === 'day' ? 'day' : 'hour';
  const unpricedModels = resource.data?.unpriced_models ?? [];
  const uncalculatedModels = resource.data?.uncalculated_models ?? [];

  const { chartData, chartOptions, hasData } = useMemo(() => {
    const series = resource.data?.series ?? [];
    const sorted = [...series].sort(
      (left, right) =>
        new Date(left.bucket ?? '').getTime() - new Date(right.bucket ?? '').getTime()
    );
    const labels = sorted.map((item) => {
      const date = new Date(item.bucket ?? '');
      if (Number.isNaN(date.getTime())) return item.bucket ?? '';
      return period === 'hour'
        ? date.toLocaleString(i18n.language, {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })
        : date.toLocaleDateString(i18n.language, { month: '2-digit', day: '2-digit' });
    });
    const values = sorted.map((item) => moneyAmount(item.cost?.amount_micros, item.cost?.amount));
    const data = {
      labels,
      datasets: [
        {
          label: t('usage_stats.total_cost'),
          data: values,
          borderColor: COST_COLOR,
          backgroundColor: buildGradient,
          pointBackgroundColor: COST_COLOR,
          pointBorderColor: COST_COLOR,
          fill: true,
          tension: 0.35,
        },
      ],
    };
    const baseOptions = buildChartOptions({ period, labels, isDark, isMobile });
    return {
      chartData: data,
      hasData: values.some((value) => value > 0),
      chartOptions: {
        ...baseOptions,
        scales: {
          ...baseOptions.scales,
          y: {
            ...baseOptions.scales?.y,
            ticks: {
              ...(baseOptions.scales?.y && 'ticks' in baseOptions.scales.y
                ? baseOptions.scales.y.ticks
                : {}),
              callback: (value: string | number) => formatUsd(Number(value)),
            },
          },
        },
      },
    };
  }, [i18n.language, isDark, isMobile, period, resource.data?.series, t]);

  const stateText =
    resource.status === 'loading'
      ? t('common.loading')
      : resource.status === 'disabled'
        ? t('usage_stats.state_disabled')
        : resource.status === 'unsupported'
          ? t('usage_stats.state_unsupported')
          : resource.status === 'error'
            ? resource.error || t('usage_stats.state_error')
            : !hasData && unpricedModels.length === 0 && uncalculatedModels.length === 0
              ? t('usage_stats.cost_no_data')
              : '';
  const requestCoverageValue = resource.data?.coverage?.request_coverage;
  const tokenCoverageValue = resource.data?.coverage?.token_coverage;
  const requestCoverage =
    requestCoverageValue === null || requestCoverageValue === undefined
      ? null
      : Number(requestCoverageValue);
  const tokenCoverage =
    tokenCoverageValue === null || tokenCoverageValue === undefined
      ? null
      : Number(tokenCoverageValue);

  return (
    <Card title={t('usage_stats.cost_trend')}>
      {resource.data && (
        <div className={styles.costSummaryRow}>
          <span>
            {t('usage_stats.request_coverage')}:{' '}
            {requestCoverage !== null && Number.isFinite(requestCoverage)
              ? `${(requestCoverage * 100).toFixed(1)}%`
              : '--'}
          </span>
          <span>
            {t('usage_stats.token_coverage')}:{' '}
            {tokenCoverage !== null && Number.isFinite(tokenCoverage)
              ? `${(tokenCoverage * 100).toFixed(1)}%`
              : '--'}
          </span>
          {resource.data.truncated && <span>{t('usage_stats.result_truncated')}</span>}
        </div>
      )}
      {unpricedModels.length > 0 && (
        <div className={styles.costNotice}>
          {t('usage_stats.unpriced_models')}: {unpricedModels.map((item) => item.model).join(', ')}
        </div>
      )}
      {uncalculatedModels.length > 0 && (
        <div className={styles.costNotice}>
          {t('usage_stats.uncalculated_models')}:{' '}
          {uncalculatedModels.map((item) => item.model).join(', ')}
        </div>
      )}
      {stateText ? (
        <div className={styles.hint}>{stateText}</div>
      ) : hasData ? (
        <div className={styles.chartWrapper}>
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
        <div className={styles.hint}>{t('usage_stats.cost_need_price')}</div>
      )}
    </Card>
  );
}
