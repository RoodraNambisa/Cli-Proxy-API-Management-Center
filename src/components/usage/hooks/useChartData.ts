import { useEffect, useMemo, useState } from 'react';
import type { ChartOptions } from 'chart.js';
import { usageApi } from '@/services/api/usage';
import { buildChartData, buildChartDataFromSeries, type ChartData } from '@/utils/usage';
import { buildChartOptions } from '@/utils/usage/chartConfig';
import type { UsageRangeQuery } from '@/types';
import type { UsagePayload } from './useUsageData';

export interface UseChartDataOptions {
  usage: UsagePayload | null;
  chartLines: string[];
  isDark: boolean;
  isMobile: boolean;
  range: UsageRangeQuery;
  hourWindowHours?: number;
}

export interface UseChartDataReturn {
  requestsPeriod: 'hour' | 'day';
  setRequestsPeriod: (period: 'hour' | 'day') => void;
  tokensPeriod: 'hour' | 'day';
  setTokensPeriod: (period: 'hour' | 'day') => void;
  requestsChartData: ChartData;
  tokensChartData: ChartData;
  requestsChartOptions: ChartOptions<'line'>;
  tokensChartOptions: ChartOptions<'line'>;
  loading: boolean;
}

export function useChartData({
  usage,
  chartLines,
  isDark,
  isMobile,
  range,
  hourWindowHours,
}: UseChartDataOptions): UseChartDataReturn {
  const [requestsPeriod, setRequestsPeriod] = useState<'hour' | 'day'>('day');
  const [tokensPeriod, setTokensPeriod] = useState<'hour' | 'day'>('day');
  const [seriesByPeriod, setSeriesByPeriod] = useState<Partial<Record<'hour' | 'day', unknown>>>(
    {}
  );
  const [seriesLoading, setSeriesLoading] = useState(false);
  const rangeKey = `${range.from || ''}::${range.to || ''}`;

  useEffect(() => {
    let cancelled = false;
    const periods = Array.from(new Set([requestsPeriod, tokensPeriod]));
    Promise.resolve()
      .then(() => {
        setSeriesLoading(true);
        return Promise.all(
          periods.map((period) =>
            usageApi
              .getUsageSeries({
                ...range,
                bucket: period,
                group_by: 'model',
              })
              .then((response) => [period, response] as const)
          )
        );
      })
      .then((entries) => {
        if (cancelled) return;
        setSeriesByPeriod(Object.fromEntries(entries) as Partial<Record<'hour' | 'day', unknown>>);
      })
      .catch(() => {
        if (cancelled) return;
        setSeriesByPeriod({});
      })
      .finally(() => {
        if (!cancelled) setSeriesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [range, rangeKey, requestsPeriod, tokensPeriod]);

  const requestsChartData = useMemo(() => {
    const series = seriesByPeriod[requestsPeriod];
    if (series) {
      return buildChartDataFromSeries(series, requestsPeriod, 'requests', chartLines);
    }
    if (!usage) return { labels: [], datasets: [] };
    return buildChartData(usage, requestsPeriod, 'requests', chartLines, { hourWindowHours });
  }, [chartLines, hourWindowHours, requestsPeriod, seriesByPeriod, usage]);

  const tokensChartData = useMemo(() => {
    const series = seriesByPeriod[tokensPeriod];
    if (series) {
      return buildChartDataFromSeries(series, tokensPeriod, 'tokens', chartLines);
    }
    if (!usage) return { labels: [], datasets: [] };
    return buildChartData(usage, tokensPeriod, 'tokens', chartLines, { hourWindowHours });
  }, [chartLines, hourWindowHours, seriesByPeriod, tokensPeriod, usage]);

  const requestsChartOptions = useMemo(
    () =>
      buildChartOptions({
        period: requestsPeriod,
        labels: requestsChartData.labels,
        isDark,
        isMobile,
      }),
    [requestsPeriod, requestsChartData.labels, isDark, isMobile]
  );

  const tokensChartOptions = useMemo(
    () =>
      buildChartOptions({
        period: tokensPeriod,
        labels: tokensChartData.labels,
        isDark,
        isMobile,
      }),
    [tokensPeriod, tokensChartData.labels, isDark, isMobile]
  );

  return {
    requestsPeriod,
    setRequestsPeriod,
    tokensPeriod,
    setTokensPeriod,
    requestsChartData,
    tokensChartData,
    requestsChartOptions,
    tokensChartOptions,
    loading: seriesLoading,
  };
}
