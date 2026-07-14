import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChartOptions } from 'chart.js';
import { usageApi } from '@/services/api/usage';
import { buildChartDataFromSeries, type ChartData } from '@/utils/usage';
import { buildChartOptions } from '@/utils/usage/chartConfig';
import type { UsageRangeQuery } from '@/types';
import type { UsageResourceStatus } from './useUsageData';

const EMPTY_SERIES_BY_PERIOD: Partial<Record<'hour' | 'day', unknown>> = {};

export interface UseChartDataOptions {
  chartLines: string[];
  isDark: boolean;
  isMobile: boolean;
  range: UsageRangeQuery;
  availabilityStatus: UsageResourceStatus;
  availabilityError?: string;
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
  status: UsageResourceStatus;
  error: string;
}

export function useChartData({
  chartLines,
  isDark,
  isMobile,
  range,
  availabilityStatus,
  availabilityError = '',
}: UseChartDataOptions): UseChartDataReturn {
  const [requestsPeriod, setRequestsPeriod] = useState<'hour' | 'day'>('day');
  const [tokensPeriod, setTokensPeriod] = useState<'hour' | 'day'>('day');
  const [seriesByPeriod, setSeriesByPeriod] = useState<Partial<Record<'hour' | 'day', unknown>>>(
    {}
  );
  const [seriesLoading, setSeriesLoading] = useState(false);
  const [seriesStatus, setSeriesStatus] = useState<UsageResourceStatus>('idle');
  const [seriesError, setSeriesError] = useState('');
  const unsupportedRef = useRef(false);
  const cacheRef = useRef<{
    rangeKey: string;
    data: Partial<Record<'hour' | 'day', unknown>>;
  }>({ rangeKey: '', data: {} });
  const rangeFrom = range.from;
  const rangeTo = range.to;
  const rangeKey = `${rangeFrom || ''}::${rangeTo || ''}`;
  const availabilityAllowsSeries = availabilityStatus === 'ready' || availabilityStatus === 'empty';

  useEffect(() => {
    const controller = new AbortController();
    if (!availabilityAllowsSeries || unsupportedRef.current) {
      return () => controller.abort();
    }

    void Promise.resolve().then(async () => {
      if (controller.signal.aborted) return;
      const periods = Array.from(new Set([requestsPeriod, tokensPeriod]));
      if (cacheRef.current.rangeKey !== rangeKey) {
        cacheRef.current = { rangeKey, data: {} };
        setSeriesByPeriod({});
      }
      const missingPeriods = periods.filter((period) => !cacheRef.current.data[period]);
      if (missingPeriods.length === 0) {
        const cached = cacheRef.current.data;
        setSeriesByPeriod(cached);
        const hasItems = periods.some((period) => {
          const items = (cached[period] as { items?: unknown[] } | undefined)?.items;
          return Array.isArray(items) && items.length > 0;
        });
        setSeriesLoading(false);
        setSeriesError('');
        setSeriesStatus(hasItems ? 'ready' : 'empty');
        return;
      }

      try {
        setSeriesLoading(true);
        setSeriesStatus('loading');
        setSeriesError('');
        const entries = await Promise.all(
          missingPeriods.map((period) =>
            usageApi
              .getUsageSeries(
                {
                  from: rangeFrom,
                  to: rangeTo,
                  bucket: period,
                  group_by: 'model',
                },
                { signal: controller.signal }
              )
              .then((response) => [period, response] as const)
          )
        );
        if (controller.signal.aborted) return;
        if (cacheRef.current.rangeKey !== rangeKey) return;
        const merged = {
          ...cacheRef.current.data,
          ...Object.fromEntries(entries),
        } as Partial<Record<'hour' | 'day', unknown>>;
        cacheRef.current = { rangeKey, data: merged };
        setSeriesByPeriod(merged);
        const hasItems = periods.some((period) => {
          const items = (merged[period] as { items?: unknown[] } | undefined)?.items;
          return Array.isArray(items) && items.length > 0;
        });
        setSeriesStatus(hasItems ? 'ready' : 'empty');
      } catch (error: unknown) {
        if (controller.signal.aborted) return;
        const status =
          error && typeof error === 'object' && 'status' in error
            ? Number((error as { status?: unknown }).status)
            : undefined;
        if (status === 404) {
          unsupportedRef.current = true;
          setSeriesStatus('unsupported');
        } else {
          setSeriesStatus('error');
          setSeriesError(error instanceof Error ? error.message : '');
        }
        setSeriesByPeriod({});
      } finally {
        if (!controller.signal.aborted) setSeriesLoading(false);
      }
    });

    return () => controller.abort();
  }, [availabilityAllowsSeries, rangeFrom, rangeKey, rangeTo, requestsPeriod, tokensPeriod]);

  const cacheMatchesRange = cacheRef.current.rangeKey === rangeKey;
  const visibleSeriesByPeriod =
    availabilityAllowsSeries && cacheMatchesRange && !unsupportedRef.current
      ? seriesByPeriod
      : EMPTY_SERIES_BY_PERIOD;

  const requestsChartData = useMemo(() => {
    const series = visibleSeriesByPeriod[requestsPeriod];
    if (series) {
      return buildChartDataFromSeries(series, requestsPeriod, 'requests', chartLines);
    }
    return { labels: [], datasets: [] };
  }, [chartLines, requestsPeriod, visibleSeriesByPeriod]);

  const tokensChartData = useMemo(() => {
    const series = visibleSeriesByPeriod[tokensPeriod];
    if (series) {
      return buildChartDataFromSeries(series, tokensPeriod, 'tokens', chartLines);
    }
    return { labels: [], datasets: [] };
  }, [chartLines, tokensPeriod, visibleSeriesByPeriod]);

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

  const status = !availabilityAllowsSeries
    ? availabilityStatus
    : unsupportedRef.current
      ? 'unsupported'
      : seriesStatus;
  const error = availabilityStatus === 'error' ? availabilityError : seriesError;

  return {
    requestsPeriod,
    setRequestsPeriod,
    tokensPeriod,
    setTokensPeriod,
    requestsChartData,
    tokensChartData,
    requestsChartOptions,
    tokensChartOptions,
    loading: availabilityStatus === 'loading' || (availabilityAllowsSeries && seriesLoading),
    status,
    error,
  };
}
