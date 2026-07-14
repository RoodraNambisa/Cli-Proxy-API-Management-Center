import { useCallback } from 'react';
import { useInterval } from '@/hooks/useInterval';
import { USAGE_STATS_STALE_TIME_MS, useUsageStatsStore } from '@/stores';
import { buildUsageRangeForTimeRange, type KeyStats, type UsageDetail } from '@/utils/usage';

const EMPTY_KEY_STATS: KeyStats = { bySource: {}, byAuthIndex: {} };
const EMPTY_USAGE_DETAILS: UsageDetail[] = [];

export type UseProviderStatsOptions = {
  enabled?: boolean;
};

export const useProviderStats = (options: UseProviderStatsOptions = {}) => {
  const enabled = options.enabled ?? true;
  const keyStats = useUsageStatsStore((state) => (enabled ? state.keyStats : EMPTY_KEY_STATS));
  const isLoading = useUsageStatsStore((state) => (enabled ? state.authsLoading : false));
  const loadUsageAuths = useUsageStatsStore((state) => state.loadUsageAuths);
  // Request details are intentionally lazy and may contain only the last filtered page.
  const usageDetails = EMPTY_USAGE_DETAILS;

  // Provider counters use the lightweight auth aggregate instead of request details.
  const loadKeyStats = useCallback(async () => {
    await loadUsageAuths({
      staleTimeMs: USAGE_STATS_STALE_TIME_MS,
      range: buildUsageRangeForTimeRange('all'),
    });
  }, [loadUsageAuths]);

  const refreshKeyStats = useCallback(async () => {
    await loadUsageAuths({
      force: true,
      staleTimeMs: USAGE_STATS_STALE_TIME_MS,
      range: buildUsageRangeForTimeRange('all'),
    });
  }, [loadUsageAuths]);

  useInterval(
    () => {
      void refreshKeyStats().catch(() => {});
    },
    enabled ? 240_000 : null
  );

  return { keyStats, usageDetails, loadKeyStats, refreshKeyStats, isLoading };
};
