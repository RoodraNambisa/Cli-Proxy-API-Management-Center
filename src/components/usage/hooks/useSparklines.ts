import { useCallback, useMemo } from 'react';
import type { UsageCostsResponse, UsageRatesResponse } from '@/types';
import type { UsageResource } from './useUsageData';

export interface SparklineData {
  labels: string[];
  datasets: [
    {
      data: number[];
      borderColor: string;
      backgroundColor: string;
      fill: boolean;
      tension: number;
      pointRadius: number;
      borderWidth: number;
    },
  ];
}

export interface SparklineBundle {
  data: SparklineData;
}

export interface UseSparklinesOptions {
  ratesResource: UsageResource<UsageRatesResponse>;
  costsResource: UsageResource<UsageCostsResponse>;
}

export interface UseSparklinesReturn {
  requestsSparkline: SparklineBundle | null;
  tokensSparkline: SparklineBundle | null;
  rpmSparkline: SparklineBundle | null;
  tpmSparkline: SparklineBundle | null;
  costSparkline: SparklineBundle | null;
}

const formatBucket = (value: string | undefined): string => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return value ?? '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const moneyAmount = (amountMicros: unknown, amount: unknown): number => {
  const micros = Number(amountMicros);
  if (Number.isFinite(micros)) return micros / 1_000_000;
  const fallback = Number(amount);
  return Number.isFinite(fallback) ? fallback : 0;
};

export function useSparklines({
  ratesResource,
  costsResource,
}: UseSparklinesOptions): UseSparklinesReturn {
  const buildSparkline = useCallback(
    (
      series: { labels: string[]; data: number[] },
      color: string,
      backgroundColor: string
    ): SparklineBundle | null => {
      if (!series.data.length) return null;
      return {
        data: {
          labels: series.labels,
          datasets: [
            {
              data: series.data,
              borderColor: color,
              backgroundColor,
              fill: true,
              tension: 0.45,
              pointRadius: 0,
              borderWidth: 2,
            },
          ],
        },
      };
    },
    []
  );

  const rateSeries = useMemo(() => {
    const items = ratesResource.data?.items ?? [];
    return {
      labels: items.map((item) => formatBucket(item.bucket)),
      requests: items.map((item) => Math.max(Number(item.requests) || 0, 0)),
      tokens: items.map((item) => Math.max(Number(item.total_tokens) || 0, 0)),
      rpm: items.map((item) => Math.max(Number(item.rpm) || 0, 0)),
      tpm: items.map((item) => Math.max(Number(item.tpm) || 0, 0)),
    };
  }, [ratesResource.data]);

  const costSeries = useMemo(() => {
    const items = costsResource.data?.series ?? [];
    return {
      labels: items.map((item) => formatBucket(item.bucket)),
      data: items.map((item) => moneyAmount(item.cost?.amount_micros, item.cost?.amount)),
    };
  }, [costsResource.data]);

  return {
    requestsSparkline: buildSparkline(
      { labels: rateSeries.labels, data: rateSeries.requests },
      '#8b8680',
      'rgba(139, 134, 128, 0.18)'
    ),
    tokensSparkline: buildSparkline(
      { labels: rateSeries.labels, data: rateSeries.tokens },
      '#8b5cf6',
      'rgba(139, 92, 246, 0.18)'
    ),
    rpmSparkline: buildSparkline(
      { labels: rateSeries.labels, data: rateSeries.rpm },
      '#22c55e',
      'rgba(34, 197, 94, 0.18)'
    ),
    tpmSparkline: buildSparkline(
      { labels: rateSeries.labels, data: rateSeries.tpm },
      '#f97316',
      'rgba(249, 115, 22, 0.18)'
    ),
    costSparkline: buildSparkline(costSeries, '#f59e0b', 'rgba(245, 158, 11, 0.18)'),
  };
}
