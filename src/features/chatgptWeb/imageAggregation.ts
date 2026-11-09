import { apiClient, type ApiClientConnectionSnapshot } from '@/services/api/client';

export const IMAGE_AGGREGATION_KEY = 'n-aggregation-concurrency';
export function readImageAggregationConcurrency(value: unknown): number {
  if (value === undefined) return 3;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 10)
    throw new Error(`${IMAGE_AGGREGATION_KEY} must be an integer between 1 and 10`);
  return value;
}
export async function supportsImageAggregation(
  connection: ApiClientConnectionSnapshot,
  signal?: AbortSignal
): Promise<boolean> {
  const result = await apiClient.getAtConnection<{ features?: unknown }>(
    connection,
    '/chatgpt-web/capabilities',
    { signal }
  );
  return Array.isArray(result?.features) && result.features.includes('image_n_parallel_v2');
}
