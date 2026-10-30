import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChartOptions } from 'chart.js';
import { Select } from '@/components/ui/Select';
import { useThemeStore } from '@/stores';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { buildChartOptions, sparklineOptions } from '@/utils/usage/chartConfig';
import type { SparklineBundle } from '@/components/usage/hooks/useSparklines';
import { useAdmissionSupport, useTrafficOverview } from './useTraffic';
import { compactTrafficSeries } from './series';
import styles from './Traffic.module.scss';

export function useTrafficStats() {
  const { t } = useTranslation();
  const supported = useAdmissionSupport();
  const isDark = useThemeStore((s) => s.resolvedTheme === 'dark');
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [window, setWindow] = useState('30');
  const [custom, setCustom] = useState('30');
  const [basis, setBasis] = useState('admitted');
  const minutes =
    window === 'custom'
      ? Math.max(1, Math.min(1440, Math.trunc(Number(custom)) || 1))
      : window === 'minute'
        ? 1
        : Number(window);
  const result = useTrafficOverview(
    `mode=${window === 'minute' ? 'current_minute' : 'rolling'}&basis=${basis}&window_minutes=${minutes}`,
    supported
  );
  const enabled = supported && !result.unsupported;
  const value = result.data;
  const points = useMemo(() => compactTrafficSeries(value?.items ?? []), [value]);
  const labels = points.map((item) => new Date(item.from).toLocaleTimeString());
  const trend: SparklineBundle | null = points.length
    ? {
        data: {
          labels,
          datasets: [
            {
              data: points.map((item) => item.rpm),
              borderColor: '#22c55e',
              backgroundColor: 'rgba(34, 197, 94, 0.18)',
              fill: true,
              tension: 0.45,
              pointRadius: 0,
              borderWidth: 2,
            },
          ],
        },
      }
    : null;
  const themed = buildChartOptions({ period: 'hour', labels, isDark, isMobile });
  const chartOptions: ChartOptions<'line'> = {
    ...sparklineOptions,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        ...themed.plugins?.tooltip,
        enabled: true,
        padding: 3,
        titleMarginBottom: 2,
        bodySpacing: 0,
        titleFont: { size: 12, lineHeight: 1 },
        bodyFont: { size: 12, lineHeight: 1 },
        displayColors: false,
        caretSize: 3,
        caretPadding: 2,
        callbacks: {
          title: (items) => {
            const point = points[items[0]?.dataIndex];
            return point
              ? `${new Date(point.from).toLocaleDateString([], { month: '2-digit', day: '2-digit' })} ${new Date(point.from).toLocaleTimeString([], { hour12: false })} – ${new Date(point.to).toLocaleDateString() === new Date(point.from).toLocaleDateString() ? '' : new Date(point.to).toLocaleDateString([], { month: '2-digit', day: '2-digit' }) + ' '}${new Date(point.to).toLocaleTimeString([], { hour12: false })}`
              : '';
          },
          label: (item) => {
            const point = points[item.dataIndex];
            return point
              ? `${t('traffic.requests')}: ${point.requests} · RPM: ${point.rpm.toFixed(2)}`
              : '';
          },
        },
      },
    },
  };
  const range =
    window === 'minute'
      ? t('traffic.current_minute')
      : minutes === 1
        ? t('traffic.rolling_60')
        : t('traffic.last_minutes', { count: minutes });
  const controls = enabled ? (
    <div className={styles.liveControls}>
      <span className={styles.liveLabel}>RPM</span>
      <Select
        className={styles.liveSelect}
        fullWidth={false}
        ariaLabel={t('traffic.basis')}
        value={basis}
        onChange={setBasis}
        options={[
          { value: 'admitted', label: t('traffic.admitted') },
          { value: 'completed', label: t('traffic.completed') },
        ]}
      />
      <Select
        className={styles.liveSelect}
        fullWidth={false}
        ariaLabel={t('traffic.range')}
        value={window}
        onChange={setWindow}
        options={[
          { value: 'minute', label: t('traffic.current_minute') },
          { value: '1', label: t('traffic.rolling_60') },
          ...[5, 15, 30, 60].map((n) => ({
            value: String(n),
            label: t('traffic.last_minutes', { count: n }),
          })),
          { value: 'custom', label: t('traffic.custom') },
        ]}
      />
      {window === 'custom' && (
        <input
          className={`input ${styles.customMinutes}`}
          aria-label={t('traffic.minutes')}
          type="number"
          min={1}
          max={1440}
          step={1}
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onBlur={() => setCustom(String(minutes))}
        />
      )}
      <details className={styles.observation}>
        <summary>
          {result.stale
            ? t('traffic.stale')
            : value
              ? `${t('traffic.updated')} ${new Date(value.as_of).toLocaleTimeString()}`
              : t('common.loading')}
        </summary>
        <div>
          {t(window === 'minute' ? 'traffic.minute_hint' : 'traffic.average_hint')}
          <br />
          {t('traffic.observed_since')}: {value ? new Date(value.started_at).toLocaleString() : '—'}
        </div>
      </details>
    </div>
  ) : null;
  return {
    enabled,
    value,
    stale: result.stale,
    range,
    basis: t(`traffic.${basis}`),
    trend,
    chartOptions,
    controls,
  };
}
