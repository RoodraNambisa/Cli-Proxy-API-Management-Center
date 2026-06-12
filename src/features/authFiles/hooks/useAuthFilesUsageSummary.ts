import { useMemo } from 'react';
import { extractTotalTokens, normalizeAuthIndex, type UsageDetail } from '@/utils/usage';

export interface AuthFileUsageSummary {
  requestCount: number;
  successCount: number;
  failureCount: number;
  totalTokens: number;
  modelCount: number;
  latestTimestampMs: number | null;
}

const createSummary = (): AuthFileUsageSummary => ({
  requestCount: 0,
  successCount: 0,
  failureCount: 0,
  totalTokens: 0,
  modelCount: 0,
  latestTimestampMs: null,
});

export function useAuthFilesUsageSummary(usageDetails: UsageDetail[]) {
  return useMemo(() => {
    const cache = new Map<string, AuthFileUsageSummary>();
    const modelsByAuthIndex = new Map<string, Set<string>>();

    usageDetails.forEach((detail) => {
      const authIndexKey = normalizeAuthIndex(detail.auth_index);
      if (!authIndexKey) return;

      const current = cache.get(authIndexKey) ?? createSummary();
      current.requestCount += 1;
      if (detail.failed === true) {
        current.failureCount += 1;
      } else {
        current.successCount += 1;
      }
      current.totalTokens += extractTotalTokens(detail);

      const timestamp = typeof detail.__timestampMs === 'number' ? detail.__timestampMs : 0;
      if (
        Number.isFinite(timestamp) &&
        timestamp > 0 &&
        (current.latestTimestampMs === null || timestamp > current.latestTimestampMs)
      ) {
        current.latestTimestampMs = timestamp;
      }

      const modelName = typeof detail.__modelName === 'string' ? detail.__modelName.trim() : '';
      if (modelName) {
        const models = modelsByAuthIndex.get(authIndexKey) ?? new Set<string>();
        models.add(modelName);
        modelsByAuthIndex.set(authIndexKey, models);
        current.modelCount = models.size;
      }

      cache.set(authIndexKey, current);
    });

    return cache;
  }, [usageDetails]);
}
