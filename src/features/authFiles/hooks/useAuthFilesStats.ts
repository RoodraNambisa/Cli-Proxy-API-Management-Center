import { useCallback } from 'react';
import { USAGE_STATS_STALE_TIME_MS, useUsageStatsStore } from '@/stores';
import type { UsageAuthSummary } from '@/types';
import { buildUsageRangeForTimeRange, type KeyStats, type UsageDetail } from '@/utils/usage';

const EMPTY_USAGE_DETAILS: UsageDetail[] = [];

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
  // Details are lazy, paginated, and may represent a filter from another page.
  const usageDetails = EMPTY_USAGE_DETAILS;
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
