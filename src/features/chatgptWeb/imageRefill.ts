import { apiClient, type ApiClientConnectionSnapshot } from '@/services/api/client';

export const IMAGE_REFILL_KEYS = [
  'n-aggregation-max-retries',
  'n-aggregation-return-partial',
] as const;
export function readImageRefillRetries(value: unknown): number {
  if (value === undefined) return 1;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 3)
    throw new Error('n-aggregation-max-retries must be an integer between 0 and 3');
  return value;
}
export function readImageReturnPartial(value: unknown): boolean {
  if (value === undefined) return false;
  if (typeof value !== 'boolean') throw new Error('n-aggregation-return-partial must be a boolean');
  return value;
}
export async function supportsImageRefill(
  connection: ApiClientConnectionSnapshot,
  signal?: AbortSignal
): Promise<boolean> {
  const result = await apiClient.getAtConnection<{ features?: unknown }>(
    connection,
    '/chatgpt-web/capabilities',
    { signal }
  );
  return Array.isArray(result?.features) && result.features.includes('image_n_refill_delivery_v1');
}
