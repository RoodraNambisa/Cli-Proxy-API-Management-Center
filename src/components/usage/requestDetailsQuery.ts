import type { UsageRangeQuery } from '@/types';

const ALL_FILTER = '__all__';
const FAILED_FILTER = 'failed';
const DETAILS_LIMIT = 200;

export interface UsageDetailFilters {
  model: string;
  source: string;
  authIndex: string;
  result: string;
}

export const buildUsageDetailsQuery = (
  filters: UsageDetailFilters,
  range: UsageRangeQuery,
  sourceFilterValue?: string
) => ({
  ...range,
  ...(filters.model !== ALL_FILTER ? { model: filters.model } : {}),
  ...(filters.source !== ALL_FILTER && sourceFilterValue ? { source: sourceFilterValue } : {}),
  ...(filters.authIndex !== ALL_FILTER ? { auth_index: filters.authIndex } : {}),
  ...(filters.result !== ALL_FILTER ? { failed: filters.result === FAILED_FILTER } : {}),
  limit: DETAILS_LIMIT,
  sort_by: 'created_at',
  sort_order: 'desc',
});
