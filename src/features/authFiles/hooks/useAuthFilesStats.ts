import { useCallback } from 'react';
import { USAGE_STATS_STALE_TIME_MS, useUsageStatsStore } from '@/stores';
import type { UsageAuthSummary } from '@/types';
import type { KeyStats, UsageDetail } from '@/utils/usage';

export type UseAuthFilesStatsResult = {
  keyStats: KeyStats;
  usageAuths: UsageAuthSummary[];
  usageDetails: UsageDetail[];
  usageLoading: boolean;
  loadKeyStats: () => Promise<void>;
  refreshKeyStats: () => Promise<void>;
};

export function useAuthFilesStats(): UseAuthFilesStatsResult {
  const keyStats = useUsageStatsStore((state) => state.keyStats);
  const usageAuths = useUsageStatsStore((state) => state.usageAuths);
  const usageDetails = useUsageStatsStore((state) => state.usageDetails);
  const usageLoading = useUsageStatsStore((state) => state.loading);
  const loadUsageStats = useUsageStatsStore((state) => state.loadUsageStats);

  const loadKeyStats = useCallback(async () => {
    await loadUsageStats({ staleTimeMs: USAGE_STATS_STALE_TIME_MS });
  }, [loadUsageStats]);

  const refreshKeyStats = useCallback(async () => {
    await loadUsageStats({ force: true, staleTimeMs: USAGE_STATS_STALE_TIME_MS });
  }, [loadUsageStats]);

  return { keyStats, usageAuths, usageDetails, usageLoading, loadKeyStats, refreshKeyStats };
}
