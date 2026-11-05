import { apiClient, type ApiClientConnectionSnapshot } from '@/services/api/client';

export const GIF_RATIO_EXCEPTION_KEY = 'gif-allow-aspect-ratio-mismatch';
export const GIF_RATIO_TOLERANCE_KEY = 'gif-aspect-ratio-max-error-percent';

export function readGIFRatioException(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value !== 'boolean') throw new Error(`${GIF_RATIO_EXCEPTION_KEY} must be a boolean`);
  return value;
}

export function readGIFRatioTolerance(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 10)
    throw new Error(`${GIF_RATIO_TOLERANCE_KEY} must be between 0 and 10`);
  return value;
}

export async function supportsGIFAspectRatio(
  connection: ApiClientConnectionSnapshot,
  signal?: AbortSignal
): Promise<boolean> {
  const response = await apiClient.getAtConnection<{ features?: unknown }>(
    connection,
    '/chatgpt-web/capabilities',
    { signal }
  );
  return (
    Array.isArray(response?.features) && response.features.includes('gif_aspect_ratio_exception_v1')
  );
}
