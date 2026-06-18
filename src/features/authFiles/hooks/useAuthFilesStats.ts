import { useCallback } from 'react';
import { USAGE_STATS_STALE_TIME_MS, useUsageStatsStore } from '@/stores';
import type { UsageAuthSummary } from '@/types';
import { buildUsageRangeForTimeRange, type KeyStats, type UsageDetail } from '@/utils/usage';

export type UseAuthFilesStatsResult = {
  keyStats: KeyStats;
  usageAuths: UsageAuthSummary[];
  usageDetails: UsageDetail[];
  usageLoading: boolean;
  loadKeyStats: (authIndexes?: Array<string | number>) => Promise<void>;
  refreshKeyStats: (authIndexes?: Array<string | number>) => Promise<void>;
};

export function useAuthFilesStats(): UseAuthFilesStatsResult {
  const keyStats = useUsageStatsStore((state) => state.keyStats);
  const usageAuths = useUsageStatsStore((state) => state.usageAuths);
  const usageDetails = useUsageStatsStore((state) => state.usageDetails);
  const usageLoading = useUsageStatsStore((state) => state.authsLoading);
  const loadUsageAuths = useUsageStatsStore((state) => state.loadUsageAuths);

  const loadKeyStats = useCallback(
    async (authIndexes?: Array<string | number>) => {
      await loadUsageAuths({
        authIndexes,
        staleTimeMs: USAGE_STATS_STALE_TIME_MS,
        range: buildUsageRangeForTimeRange('all'),
      });
    },
    [loadUsageAuths]
  );

  const refreshKeyStats = useCallback(
    async (authIndexes?: Array<string | number>) => {
      await loadUsageAuths({
        authIndexes,
        force: true,
        staleTimeMs: USAGE_STATS_STALE_TIME_MS,
        range: buildUsageRangeForTimeRange('all'),
      });
    },
    [loadUsageAuths]
  );

  return { keyStats, usageAuths, usageDetails, usageLoading, loadKeyStats, refreshKeyStats };
}
