import { useMemo } from 'react';
import type { UsageAuthSummary } from '@/types';
import { normalizeAuthIndex } from '@/utils/usage';
import { parseTimestampMs } from '@/utils/timestamp';

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

const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getLatestTimestampMs = (auth: UsageAuthSummary): number | null => {
  const raw =
    typeof auth.last_used_at === 'string'
      ? auth.last_used_at
      : typeof auth.lastUsedAt === 'string'
        ? auth.lastUsedAt
        : '';
  if (!raw) return null;
  const parsed = parseTimestampMs(raw);
  return Number.isNaN(parsed) ? null : parsed;
};

export function useAuthFilesUsageSummary(usageAuths: UsageAuthSummary[]) {
  return useMemo(() => {
    const cache = new Map<string, AuthFileUsageSummary>();

    usageAuths.forEach((auth) => {
      const authIndexKey = normalizeAuthIndex(auth.auth_index ?? auth.authIndex);
      if (!authIndexKey) return;

      const summary = createSummary();
      summary.requestCount = Math.max(toNumber(auth.total_requests), 0);
      summary.successCount = Math.max(toNumber(auth.success_count), 0);
      summary.failureCount = Math.max(toNumber(auth.failure_count), 0);
      summary.totalTokens = Math.max(
        toNumber(auth.total_tokens),
        toNumber(auth.tokens?.total_tokens),
        0
      );
      summary.modelCount = Math.max(toNumber(auth.model_count ?? auth.modelCount), 0);
      summary.latestTimestampMs = getLatestTimestampMs(auth);

      cache.set(authIndexKey, summary);
    });

    return cache;
  }, [usageAuths]);
}
